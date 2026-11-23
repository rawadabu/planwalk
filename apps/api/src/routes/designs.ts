import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { Design, emptyDesign, parseBrief, validate } from '@planwalk/design'
import { parseHouse } from '@planwalk/house'
import { db } from '../db/client.js'
import { design, designBrief, designRevision, house, project, user } from '../db/schema.js'
import { requireUser, projectRole } from '../lib/guard.js'
import { can } from '../lib/permissions.js'
import { storage } from '../lib/storage.js'

/** The caller's role in the organisation that owns a house (designs are for team members; buyers come with A-10). */
async function houseRole(req: FastifyRequest, reply: FastifyReply, houseId: string) {
  const s = await requireUser(req, reply); if (!s) return null
  const [h] = await db.select().from(house).where(eq(house.id, houseId)).limit(1)
  if (!h?.projectId) { reply.code(404).send({ error: 'not found' }); return null }
  const [p] = await db.select({ org: project.organizationId }).from(project).where(eq(project.id, h.projectId)).limit(1)
  const role = p ? await projectRole(s.user.id, h.projectId, p.org) : null
  if (!role || (role === 'client' && (h.draftOf || h.version === 0))) { reply.code(404).send({ error: 'not found' }); return null }
  return { session: s, house: h, role }
}
const deny = (reply: FastifyReply, role: string, action: string) => reply.code(403).send({ error: `Your role (${role}) can't ${action} designs` })

async function loadHouse(id: string) {
  try { return parseHouse(JSON.parse((await storage.read(`houses/${id}/house.json`)).toString())) } catch { return undefined }
}
/** Parse + rules. Errors block saving; warnings are returned with the saved design. */
async function check(houseId: string, data: unknown) {
  const parsed = Design.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Not a valid design' }
  const issues = validate(parsed.data, await loadHouse(houseId))
  const errors = issues.filter(i => i.level === 'error')
  if (errors.length) return { error: `${errors[0].target}: ${errors[0].message}`, issues }
  return { data: parsed.data, issues }
}
const view = (d: typeof design.$inferSelect, extra: object = {}) => ({ id: d.id, houseId: d.houseId, name: d.name, data: d.data, version: d.version, updatedAt: d.updatedAt, ...extra })

export async function designRoutes(app: FastifyInstance) {
  // ── the design questionnaire: one set of answers per person and house ──
  app.get<{ Params: { id: string } }>('/api/houses/:id/brief', async (req, reply) => {
    const ctx = await houseRole(req, reply, req.params.id); if (!ctx) return
    const [row] = await db.select().from(designBrief).where(and(eq(designBrief.houseId, ctx.house.id), eq(designBrief.userId, ctx.session.user.id))).limit(1)
    return { brief: row ? parseBrief(row.data) : null, updatedAt: row?.updatedAt ?? null }
  })
  app.put<{ Params: { id: string } }>('/api/houses/:id/brief', async (req, reply) => {
    const ctx = await houseRole(req, reply, req.params.id); if (!ctx) return
    if (!can(ctx.role, 'design', 'create')) return deny(reply, ctx.role, 'create')
    const brief = parseBrief(req.body)
    await db.insert(designBrief).values({ houseId: ctx.house.id, userId: ctx.session.user.id, data: brief })
      .onConflictDoUpdate({ target: [designBrief.houseId, designBrief.userId], set: { data: brief, updatedAt: new Date() } })
    return { brief }
  })
  // the studio reads what its clients answered
  app.get<{ Params: { id: string } }>('/api/houses/:id/briefs', async (req, reply) => {
    const ctx = await houseRole(req, reply, req.params.id); if (!ctx) return
    if (ctx.role === 'client') return reply.code(403).send({ error: "Clients see their own answers only" })
    const rows = await db.select({ name: user.name, data: designBrief.data, updatedAt: designBrief.updatedAt }).from(designBrief).leftJoin(user, eq(user.id, designBrief.userId)).where(eq(designBrief.houseId, ctx.house.id)).orderBy(desc(designBrief.updatedAt))
    return rows.map(r => ({ name: r.name, brief: parseBrief(r.data), updatedAt: r.updatedAt }))
  })

  app.get<{ Params: { id: string } }>('/api/houses/:id/designs', async (req, reply) => {
    const ctx = await houseRole(req, reply, req.params.id); if (!ctx) return
    const rows = await db.select({ id: design.id, name: design.name, version: design.version, updatedAt: design.updatedAt, updatedBy: user.name })
      .from(design).leftJoin(user, eq(user.id, design.updatedBy))
      .where(ctx.role === 'client' ? and(eq(design.houseId, ctx.house.id), eq(design.createdBy, ctx.session.user.id)) : eq(design.houseId, ctx.house.id)).orderBy(desc(design.updatedAt))
    return { designs: rows, can: { create: can(ctx.role, 'design', 'create'), update: can(ctx.role, 'design', 'update'), delete: can(ctx.role, 'design', 'delete') } }
  })

  const Create = z.object({ name: z.string().trim().min(1).max(80), from: z.string().uuid().optional() })
  app.post<{ Params: { id: string } }>('/api/houses/:id/designs', async (req, reply) => {
    const ctx = await houseRole(req, reply, req.params.id); if (!ctx) return
    if (!can(ctx.role, 'design', 'create')) return deny(reply, ctx.role, 'create')
    const b = Create.safeParse(req.body); if (!b.success) return reply.code(400).send({ error: 'Give the design a name' })
    let data: unknown = emptyDesign()
    if (b.data.from) {
      const [src] = await db.select().from(design).where(and(eq(design.id, b.data.from), eq(design.houseId, ctx.house.id))).limit(1)
      if (!src || (ctx.role === 'client' && src.createdBy !== ctx.session.user.id)) return reply.code(404).send({ error: 'The design to copy was not found' })
      data = src.data
    }
    const id = randomUUID(), uid = ctx.session.user.id
    const [row] = await db.transaction(async tx => {
      const r = await tx.insert(design).values({ id, houseId: ctx.house.id, name: b.data.name, data, createdBy: uid, updatedBy: uid }).returning()
      await tx.insert(designRevision).values({ id: randomUUID(), designId: id, version: 1, name: b.data.name, data, authorId: uid })
      return r
    })
    return reply.code(201).send(view(row))
  })

  app.get<{ Params: { id: string } }>('/api/designs/:id', async (req, reply) => {
    const [d] = await db.select().from(design).where(eq(design.id, req.params.id)).limit(1); if (!d) return reply.code(404).send({ error: 'not found' })
    const ctx = await houseRole(req, reply, d.houseId); if (!ctx) return
    if (ctx.role === 'client' && d.createdBy !== ctx.session.user.id) return reply.code(404).send({ error: 'not found' })      // a client works on their own designs
    return view(d)
  })

  // Save. Sends the version it started from; if someone saved in between → 409 with the current design.
  const Save = z.object({ version: z.number().int().positive(), data: z.unknown(), name: z.string().trim().min(1).max(80).optional() })
  app.put<{ Params: { id: string } }>('/api/designs/:id', async (req, reply) => {
    const [d] = await db.select().from(design).where(eq(design.id, req.params.id)).limit(1); if (!d) return reply.code(404).send({ error: 'not found' })
    const ctx = await houseRole(req, reply, d.houseId); if (!ctx) return
    if (ctx.role === 'client' && d.createdBy !== ctx.session.user.id) return reply.code(404).send({ error: 'not found' })      // a client works on their own designs
    if (!can(ctx.role, 'design', 'update')) return deny(reply, ctx.role, 'edit')
    const b = Save.safeParse(req.body); if (!b.success) return reply.code(400).send({ error: 'bad request' })
    const c = await check(d.houseId, b.data.data)
    if (!c.data) return reply.code(422).send({ error: c.error, issues: c.issues })
    const uid = ctx.session.user.id, next = b.data.version + 1, name = b.data.name ?? d.name
    const saved = await db.transaction(async tx => {
      const r = await tx.update(design).set({ data: c.data, name, version: next, updatedBy: uid, updatedAt: new Date() })
        .where(and(eq(design.id, d.id), eq(design.version, b.data.version))).returning()
      if (!r.length) return null
      await tx.insert(designRevision).values({ id: randomUUID(), designId: d.id, version: next, name, data: c.data, authorId: uid })
      return r[0]
    })
    if (!saved) {
      const [cur] = await db.select().from(design).where(eq(design.id, d.id)).limit(1)
      return reply.code(409).send({ error: 'Someone saved this design after you opened it', current: view(cur) })
    }
    return view(saved, { issues: c.issues })
  })

  app.delete<{ Params: { id: string } }>('/api/designs/:id', async (req, reply) => {
    const [d] = await db.select().from(design).where(eq(design.id, req.params.id)).limit(1); if (!d) return reply.code(404).send({ error: 'not found' })
    const ctx = await houseRole(req, reply, d.houseId); if (!ctx) return
    if (ctx.role === 'client' && d.createdBy !== ctx.session.user.id) return reply.code(404).send({ error: 'not found' })      // a client works on their own designs
    if (!can(ctx.role, 'design', 'delete')) return deny(reply, ctx.role, 'delete')
    await db.delete(design).where(eq(design.id, d.id))
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/api/designs/:id/revisions', async (req, reply) => {
    const [d] = await db.select().from(design).where(eq(design.id, req.params.id)).limit(1); if (!d) return reply.code(404).send({ error: 'not found' })
    const ctx = await houseRole(req, reply, d.houseId); if (!ctx) return
    if (ctx.role === 'client' && d.createdBy !== ctx.session.user.id) return reply.code(404).send({ error: 'not found' })      // a client works on their own designs
    return db.select({ version: designRevision.version, name: designRevision.name, createdAt: designRevision.createdAt, author: user.name })
      .from(designRevision).leftJoin(user, eq(user.id, designRevision.authorId)).where(eq(designRevision.designId, d.id)).orderBy(desc(designRevision.version))
  })

  // Restore an earlier version as a new version (history is never rewritten)
  app.post<{ Params: { id: string } }>('/api/designs/:id/restore', async (req, reply) => {
    const [d] = await db.select().from(design).where(eq(design.id, req.params.id)).limit(1); if (!d) return reply.code(404).send({ error: 'not found' })
    const ctx = await houseRole(req, reply, d.houseId); if (!ctx) return
    if (ctx.role === 'client' && d.createdBy !== ctx.session.user.id) return reply.code(404).send({ error: 'not found' })      // a client works on their own designs
    if (!can(ctx.role, 'design', 'update')) return deny(reply, ctx.role, 'edit')
    const b = z.object({ version: z.number().int().positive() }).safeParse(req.body); if (!b.success) return reply.code(400).send({ error: 'bad request' })
    const [rev] = await db.select().from(designRevision).where(and(eq(designRevision.designId, d.id), eq(designRevision.version, b.data.version))).limit(1)
    if (!rev) return reply.code(404).send({ error: 'That version does not exist' })
    const uid = ctx.session.user.id, next = d.version + 1
    const [row] = await db.transaction(async tx => {
      const r = await tx.update(design).set({ data: rev.data, version: next, updatedBy: uid, updatedAt: new Date() }).where(eq(design.id, d.id)).returning()
      await tx.insert(designRevision).values({ id: randomUUID(), designId: d.id, version: next, name: r[0].name, data: rev.data, authorId: uid })
      return r
    })
    return view(row)
  })
}
