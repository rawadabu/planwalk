import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNull, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { parseHouse } from '@planwalk/house'
import { db } from '../db/client.js'
import { comment, house, member, project, shareLink } from '../db/schema.js'
import { getSession, requireProject, roleIn } from '../lib/guard.js'
import { can } from '../lib/permissions.js'
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

/**
 * How this request reaches a house: org membership (role), a valid share token (?share= or x-share-token),
 * or the house being a public demo. null = no access.
 */
async function access(req: FastifyRequest, houseId: string) {
  const [h] = await db.select().from(house).where(eq(house.id, houseId)).limit(1)
  if (!h) return null
  const s = await getSession(req)
  let role: string | null = null
  if (s && h.projectId) {
    const [p] = await db.select({ org: project.organizationId }).from(project).where(eq(project.id, h.projectId)).limit(1)
    if (p) role = await roleIn(s.user.id, p.org)
  }
  const token = (req.query as { share?: string }).share ?? (req.headers['x-share-token'] as string | undefined)
  const link = await validShare(token)
  const share = link && link.houseId === h.id ? link : null
  if (!role && !share && !h.public) return null
  return { house: h, session: s, role, share }
}
type Access = NonNullable<Awaited<ReturnType<typeof access>>>
const canView = async (req: FastifyRequest, id: string) => (await access(req, id))?.house ?? null
const mayComment = (a: Access) => (a.role ? can(a.role, 'comment', 'create') : a.share?.permission === 'comment')
const mayResolve = (a: Access) => !!a.role && can(a.role, 'comment', 'resolve')

// tiny per-IP limiter for guest comments (share links are public URLs)
const hits = new Map<string, number[]>()
function limited(ip: string, max = 20, windowMs = 60_000) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter(t => now - t < windowMs)
  list.push(now); hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > max
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

  // What the viewer needs besides the geometry: location for the real sun, and what this visitor may do
  app.get<{ Params: { id: string } }>('/api/houses/:id/meta', async (req, reply) => {
    if (!ID.test(req.params.id)) return reply.code(400).send({ error: 'bad id' })
    const a = await access(req, req.params.id); if (!a) return deny(reply)
    const [p] = a.house.projectId ? await db.select().from(project).where(eq(project.id, a.house.projectId)).limit(1) : []
    reply.header('cache-control', 'private, no-store')
    return {
      id: a.house.id, title: a.house.title,
      location: p?.lat != null && p?.lng != null ? { address: p.address, lat: p.lat, lng: p.lng, north: p.northDeg ?? 0 } : null,
      viewer: { signedIn: !!a.session, name: a.session?.user.name ?? null, role: a.role, via: a.role ? 'member' : a.share ? 'share' : 'public' },
      can: { comment: mayComment(a), resolve: mayResolve(a) },
    }
  })

  // ── comments pinned in the house ──
  const NewComment = z.object({
    body: z.string().trim().min(1, 'Write something').max(2000),
    floor: z.number().int().min(0).max(2), x: z.number().min(-2000).max(5000), y: z.number().min(-2000).max(5000), h: z.number().min(0).max(10).default(0),
    parentId: z.string().uuid().optional(),
    authorName: z.string().trim().min(1).max(60).optional(),
  })
  const view = (c: typeof comment.$inferSelect) => ({ id: c.id, parentId: c.parentId, authorName: c.authorName, body: c.body, floor: c.floor, x: c.x, y: c.y, h: c.h, resolved: !!c.resolvedAt, createdAt: c.createdAt, mine: false as boolean })

  app.get<{ Params: { id: string } }>('/api/houses/:id/comments', async (req, reply) => {
    if (!ID.test(req.params.id)) return reply.code(400).send({ error: 'bad id' })
    const a = await access(req, req.params.id); if (!a) return deny(reply)
    if (!a.role && !(a.share?.permission === 'comment')) return []      // public demo / view-only links: no comments shown
    const rows = await db.select().from(comment).where(eq(comment.houseId, a.house.id)).orderBy(comment.createdAt)
    reply.header('cache-control', 'private, no-store')
    return rows.map(c => ({ ...view(c), mine: (!!a.session && c.authorId === a.session.user.id) || (!!a.share && c.shareLinkId === a.share.id && !c.authorId) }))
  })

  app.post<{ Params: { id: string } }>('/api/houses/:id/comments', async (req, reply) => {
    if (!ID.test(req.params.id)) return reply.code(400).send({ error: 'bad id' })
    const a = await access(req, req.params.id); if (!a) return deny(reply)
    if (!mayComment(a)) return reply.code(403).send({ error: a.share ? 'This link is view-only' : 'Sign in, or open a link that allows comments' })
    if (!a.role && limited(req.ip)) return reply.code(429).send({ error: 'Too many comments, try again in a minute' })
    const b = NewComment.safeParse(req.body)
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'Check the comment' })
    const name = a.role ? a.session!.user.name : b.data.authorName
    if (!name) return reply.code(400).send({ error: 'Add your name so the team knows who wrote it' })
    if (b.data.parentId) {
      const [parent] = await db.select({ houseId: comment.houseId }).from(comment).where(eq(comment.id, b.data.parentId)).limit(1)
      if (parent?.houseId !== a.house.id) return reply.code(400).send({ error: 'Reply to a comment in this house' })
    }
    const [row] = await db.insert(comment).values({
      id: randomUUID(), houseId: a.house.id, parentId: b.data.parentId, authorId: a.role ? a.session!.user.id : null, authorName: name,
      shareLinkId: a.role ? null : a.share!.id, body: b.data.body, floor: b.data.floor, x: b.data.x, y: b.data.y, h: b.data.h,
    }).returning()
    return reply.code(201).send({ ...view(row), mine: true })
  })

  app.patch<{ Params: { id: string } }>('/api/comments/:id', async (req, reply) => {
    const [c] = await db.select().from(comment).where(eq(comment.id, req.params.id)).limit(1); if (!c) return deny(reply)
    const a = await access(req, c.houseId); if (!a || !mayResolve(a)) return reply.code(a ? 403 : 404).send({ error: a ? "Your role can't resolve comments" : 'not found' })
    const b = z.object({ resolved: z.boolean() }).safeParse(req.body)
    if (!b.success) return reply.code(400).send({ error: 'bad request' })
    const [row] = await db.update(comment).set(b.data.resolved ? { resolvedAt: new Date(), resolvedBy: a.session!.user.id } : { resolvedAt: null, resolvedBy: null }).where(eq(comment.id, c.id)).returning()
    return view(row)
  })

  app.delete<{ Params: { id: string } }>('/api/comments/:id', async (req, reply) => {
    const [c] = await db.select().from(comment).where(eq(comment.id, req.params.id)).limit(1); if (!c) return deny(reply)
    const a = await access(req, c.houseId); if (!a) return deny(reply)
    const own = !!a.session && c.authorId === a.session.user.id
    if (!own && !(a.role && can(a.role, 'comment', 'delete'))) return reply.code(403).send({ error: 'Only the author or an admin can delete this' })
    await db.delete(comment).where(or(eq(comment.id, c.id), eq(comment.parentId, c.id)))
    return reply.code(204).send()
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
