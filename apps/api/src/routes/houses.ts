import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNull, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { parseHouse } from '@planwalk/house'
import { db } from '../db/client.js'
import { house, member, project, shareLink } from '../db/schema.js'
import { getSession, requireProject, roleIn } from '../lib/guard.js'
import { storage } from '../lib/storage.js'

const ID = /^[a-z0-9-]{1,64}$/
const FILE = /^[a-z0-9_.-]{1,64}\.(png|jpg|webp)$/i
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** A share link that is valid right now, by raw token. */
async function validShare(token: string | undefined) {
  if (!token || token.length < 20 || token.length > 100) return null
  const [l] = await db.select().from(shareLink)
    .where(and(eq(shareLink.tokenHash, sha256(token)), isNull(shareLink.revokedAt), or(isNull(shareLink.expiresAt), gt(shareLink.expiresAt, new Date()))))
    .limit(1)
  return l ?? null
}

/** Can this request see the house? public demo · member of the owning org · valid share token (?share= or x-share-token). */
async function canView(req: FastifyRequest, houseId: string) {
  const [h] = await db.select().from(house).where(eq(house.id, houseId)).limit(1)
  if (!h) return null
  if (h.public) return h
  const token = (req.query as { share?: string }).share ?? (req.headers['x-share-token'] as string | undefined)
  const link = await validShare(token)
  if (link && link.houseId === h.id) return h
  const s = await getSession(req)
  if (s && h.projectId) {
    const [p] = await db.select({ org: project.organizationId }).from(project).where(eq(project.id, h.projectId)).limit(1)
    if (p && (await roleIn(s.user.id, p.org))) return h
  }
  return null
}
function deny(reply: FastifyReply) { return reply.code(404).send({ error: 'not found' }) }   // never reveal that a private house exists

export async function houseRoutes(app: FastifyInstance) {
  // Houses I can open: public demos + houses in my organizations
  app.get('/api/houses', async req => {
    const s = await getSession(req)
    const mine = s ? db.select({ id: project.id }).from(project).where(inArray(project.organizationId, db.select({ o: member.organizationId }).from(member).where(eq(member.userId, s.user.id)))) : null
    const rows = await db.select({ id: house.id, title: house.title, public: house.public, projectId: house.projectId }).from(house)
      .where(mine ? or(eq(house.public, true), inArray(house.projectId, mine)) : eq(house.public, true))
    return rows
  })

  app.get<{ Params: { id: string } }>('/api/houses/:id/house.json', async (req, reply) => {
    if (!ID.test(req.params.id)) return reply.code(400).send({ error: 'bad id' })
    const h = await canView(req, req.params.id); if (!h) return deny(reply)
    const key = `houses/${h.id}/house.json`
    if (!(await storage.exists(key))) return reply.code(409).send({ error: 'This home is still being prepared' })
    reply.header('cache-control', h.public ? 'public, max-age=60' : 'private, no-store')
    return parseHouse(JSON.parse((await storage.read(key)).toString()))
  })

  app.get<{ Params: { id: string; file: string } }>('/api/houses/:id/:file', async (req, reply) => {
    const { id, file } = req.params
    if (!ID.test(id) || !FILE.test(file)) return reply.code(400).send({ error: 'bad path' })
    const h = await canView(req, id); if (!h) return deny(reply)
    const key = `houses/${id}/${file}`
    if (!(await storage.exists(key))) return deny(reply)
    reply.header('cache-control', h.public ? 'public, max-age=3600' : 'private, max-age=600')
    return reply.type(file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg').send(await storage.read(key))
  })

  // ── share links ──
  const CreateShare = z.object({ permission: z.enum(['view', 'comment']).default('view'), expiresInDays: z.number().int().min(1).max(365).nullable().default(30), label: z.string().trim().max(80).optional() })

  app.post<{ Params: { id: string } }>('/api/houses/:id/shares', async (req, reply) => {
    const [h] = await db.select().from(house).where(eq(house.id, req.params.id)).limit(1)
    if (!h?.projectId) return deny(reply)
    const ctx = await requireProject(req, reply, h.projectId, 'share', 'create'); if (!ctx) return
    const body = CreateShare.safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'Check the link settings' })
    const token = randomBytes(24).toString('base64url')
    const expiresAt = body.data.expiresInDays ? new Date(Date.now() + body.data.expiresInDays * 864e5) : null
    const [row] = await db.insert(shareLink).values({ id: randomUUID(), tokenHash: sha256(token), houseId: h.id, permission: body.data.permission, label: body.data.label, expiresAt, createdBy: ctx.session.user.id }).returning()
    // the raw token is returned exactly once
    return reply.code(201).send({ id: row.id, token, path: `/s/${token}`, permission: row.permission, expiresAt: row.expiresAt, label: row.label })
  })

  app.get<{ Params: { id: string } }>('/api/houses/:id/shares', async (req, reply) => {
    const [h] = await db.select().from(house).where(eq(house.id, req.params.id)).limit(1)
    if (!h?.projectId) return deny(reply)
    const ctx = await requireProject(req, reply, h.projectId, 'project', 'read'); if (!ctx) return
    return db.select({ id: shareLink.id, permission: shareLink.permission, label: shareLink.label, expiresAt: shareLink.expiresAt, createdAt: shareLink.createdAt, revokedAt: shareLink.revokedAt })
      .from(shareLink).where(eq(shareLink.houseId, h.id)).orderBy(desc(shareLink.createdAt))
  })

  app.delete<{ Params: { id: string } }>('/api/shares/:id', async (req, reply) => {
    const [l] = await db.select().from(shareLink).where(eq(shareLink.id, req.params.id)).limit(1)
    if (!l) return deny(reply)
    const [h] = await db.select().from(house).where(eq(house.id, l.houseId)).limit(1)
    if (!h?.projectId) return deny(reply)
    const ctx = await requireProject(req, reply, h.projectId, 'share', 'revoke'); if (!ctx) return
    await db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, l.id))
    return reply.code(204).send()
  })

  // Public: resolve a share token to the house it opens (no login)
  app.get<{ Params: { token: string } }>('/api/share/:token', async (req, reply) => {
    const l = await validShare(req.params.token)
    if (!l) return reply.code(404).send({ error: 'This link has expired or was turned off' })
    const [h] = await db.select({ id: house.id, title: house.title }).from(house).where(eq(house.id, l.houseId)).limit(1)
    return { houseId: h.id, title: h.title, permission: l.permission, expiresAt: l.expiresAt }
  })
}
