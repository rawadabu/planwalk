import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { parseDesign, type Design } from '@planwalk/design'
import { db } from '../db/client.js'
import { design, house, project, realView, user } from '../db/schema.js'
import { projectRole, requireUser } from '../lib/guard.js'
import { can } from '../lib/permissions.js'
import { storage } from '../lib/storage.js'
import { available, generate, promptFor, ratioFor, toJpeg } from '../lib/realview.js'
import { config } from '../config.js'

const ID = /^[a-z0-9-]{1,64}$/

/** Photoreal views of a house: a frame from the viewer goes in, a picture of the same view comes out a minute later. */
export async function realViewRoutes(app: FastifyInstance) {
  const ctxOf = async (req: FastifyRequest, reply: FastifyReply, houseId: string) => {
    const s = await requireUser(req, reply); if (!s) return null
    const [h] = ID.test(houseId) ? await db.select().from(house).where(eq(house.id, houseId)).limit(1) : []
    const [p] = h?.projectId ? await db.select().from(project).where(eq(project.id, h.projectId)).limit(1) : []
    const role = p ? await projectRole(s.user.id, p.id, p.organizationId) : null
    if (!h || !p || !role || h.draftOf || (role === 'client' && h.version === 0)) { reply.code(404).send({ error: 'not found' }); return null }
    return { session: s, house: h, project: p, role }
  }
  /** pictures this project has used (failed ones do not count) and may still make */
  const usage = async (projectId: string) => {
    const houses = db.select({ id: house.id }).from(house).where(eq(house.projectId, projectId))
    const used = (await db.select({ id: realView.id }).from(realView).where(and(inArray(realView.houseId, houses), ne(realView.status, 'failed')))).length
    return { used, quota: config.realview.quota, left: Math.max(0, config.realview.quota - used) }
  }
  const view = (r: typeof realView.$inferSelect & { by?: string | null }) => ({ id: r.id, room: r.room, status: r.status, file: r.file, error: r.status === 'failed' ? r.error : null, createdAt: r.createdAt, by: r.by ?? null })

  app.get<{ Params: { id: string } }>('/api/houses/:id/realviews', async (req, reply) => {
    const ctx = await ctxOf(req, reply, req.params.id); if (!ctx) return
    const rows = await db.select({ r: realView, by: user.name }).from(realView).leftJoin(user, eq(user.id, realView.userId)).where(eq(realView.houseId, ctx.house.id)).orderBy(desc(realView.createdAt)).limit(60)
    reply.header('cache-control', 'private, no-store')
    return { available: await available(), ...(await usage(ctx.project.id)), views: rows.map(x => view({ ...x.r, by: x.by })) }
  })

  // a frame of the viewer (JPEG or PNG) plus where it was taken; the prompt is built on the server
  app.post<{ Params: { id: string } }>('/api/houses/:id/realviews', async (req, reply) => {
    const ctx = await ctxOf(req, reply, req.params.id); if (!ctx) return
    if (!can(ctx.role, 'design', 'create')) return reply.code(403).send({ error: `Your role (${ctx.role}) can't make pictures` })
    if (!(await available())) return reply.code(503).send({ error: 'Photoreal pictures are not set up on this server yet' })
    const u = await usage(ctx.project.id)
    if (u.left <= 0) return reply.code(402).send({ error: `This project has used all ${u.quota} of its pictures` })
    const part = await req.file({ limits: { fileSize: 6 * 1024 * 1024, files: 1 } })
    if (!part) return reply.code(400).send({ error: 'No picture was sent' })
    const buf = await part.toBuffer()
    if (part.file.truncated) return reply.code(413).send({ error: 'The picture is too large' })
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8, png = buf.subarray(1, 4).toString() === 'PNG'
    if (!jpeg && !png) return reply.code(400).send({ error: 'Send the frame as a JPEG or PNG image' })
    const f = (k: string) => { const v = (part.fields as Record<string, { value?: unknown } | undefined>)[k]?.value; return typeof v === 'string' ? v : '' }
    const w = Math.max(1, Number(f('width')) || 3), h = Math.max(1, Number(f('height')) || 2)
    const room = f('room').slice(0, 60) || null, scene = f('scene') === 'exterior' ? 'exterior' as const : 'interior' as const
    // the design in view, for its materials (only one the caller may read)
    let d: Design | null = null
    const designId = f('designId')
    if (/^[0-9a-f-]{36}$/.test(designId)) {
      const [row] = await db.select().from(design).where(and(eq(design.id, designId), eq(design.houseId, ctx.house.id))).limit(1)
      if (row && (ctx.role !== 'client' || row.createdBy === ctx.session.user.id)) { try { d = parseDesign(row.data) } catch { d = null } }
    }
    const id = randomUUID(), src = `houses/${ctx.house.id}/real_${id}_src.${jpeg ? 'jpg' : 'png'}`
    await storage.write(src, buf)
    const [row] = await db.insert(realView).values({ id, houseId: ctx.house.id, userId: ctx.session.user.id, room }).returning()
    // make it in the background; the page polls the list
    void (async () => {
      try {
        const out = await toJpeg(await generate(storage.localPath(src), promptFor(room, scene, d), ratioFor(w, h)))
        const file = `real_${id}.${out.ext}`
        await storage.write(`houses/${ctx.house.id}/${file}`, out.data)
        await db.update(realView).set({ status: 'done', file }).where(eq(realView.id, id))
      } catch (e) {
        req.log.warn({ err: e }, 'real view failed')
        await db.update(realView).set({ status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).where(eq(realView.id, id)).catch(() => {})
      }
    })()
    return reply.code(202).send({ ...view(row), ...(await usage(ctx.project.id)) })
  })
}
