import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { planUpload } from '../db/schema.js'
import { requireProject } from '../lib/guard.js'
import { storage } from '../lib/storage.js'
import { applyEdits, buildUpload } from '../lib/build.js'

const Edits = z.object({
  rooms: z.array(z.object({ storey: z.number().int(), index: z.number().int().min(0), name: z.string().trim().min(1).max(60) })).max(200).optional(),
  openings: z.array(z.object({ storey: z.number().int(), index: z.number().int().min(0), kind: z.enum(['window', 'glass-door']) })).max(400).optional(),
})

/** The review step between "plans uploaded" and "clients can walk in": status, what was understood, corrections, publish. */
export async function uploadRoutes(app: FastifyInstance) {
  const load = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, action: 'create' | 'review') => {
    const [up] = await db.select().from(planUpload).where(eq(planUpload.id, req.params.id)).limit(1)
    if (!up) { reply.code(404).send({ error: 'Upload not found' }); return null }
    const ctx = await requireProject(req, reply, up.projectId, 'upload', action); if (!ctx) return null
    return up
  }
  const pub = (u: typeof planUpload.$inferSelect) => ({ id: u.id, projectId: u.projectId, fileName: u.fileName, sizeBytes: u.sizeBytes, status: u.status, houseId: u.houseId, error: u.error, report: u.report, createdAt: u.createdAt })

  // status + report (the project page polls this while the build runs)
  app.get<{ Params: { id: string } }>('/api/uploads/:id', async (req, reply) => { const up = await load(req, reply, 'create'); if (up) return pub(up) })

  // what the pipeline understood: storeys, walls, rooms, openings (no furniture strokes)
  app.get<{ Params: { id: string } }>('/api/uploads/:id/plan', async (req, reply) => {
    const up = await load(req, reply, 'review'); if (!up) return
    if (!up.houseId || !(await storage.exists(`houses/${up.houseId}/plan.json`))) return reply.code(409).send({ error: 'The plans are not built yet' })
    return reply.type('application/json').send(await storage.read(`houses/${up.houseId}/plan.json`))
  })

  // corrections: room names, window ↔ glass door
  app.patch<{ Params: { id: string } }>('/api/uploads/:id/plan', async (req, reply) => {
    const up = await load(req, reply, 'review'); if (!up) return
    const body = Edits.safeParse(req.body); if (!body.success) return reply.code(400).send({ error: 'Invalid corrections', details: body.error.issues })
    if (up.status !== 'review' && up.status !== 'ready') return reply.code(409).send({ error: 'The plans are not built yet' })
    const report = await applyEdits(up.id, body.data)
    return { report }
  })

  // reviewed: the house is ready to share
  app.post<{ Params: { id: string } }>('/api/uploads/:id/publish', async (req, reply) => {
    const up = await load(req, reply, 'review'); if (!up) return
    if (up.status !== 'review' && up.status !== 'ready') return reply.code(409).send({ error: 'Only reviewed plans can be published' })
    const [row] = await db.update(planUpload).set({ status: 'ready' }).where(eq(planUpload.id, up.id)).returning()
    return pub(row)
  })

  // build again (after a failure, or after the pipeline improved)
  app.post<{ Params: { id: string } }>('/api/uploads/:id/rebuild', async (req, reply) => {
    const up = await load(req, reply, 'review'); if (!up) return
    if (up.status === 'extracting') return reply.code(409).send({ error: 'Already building' })
    await db.update(planUpload).set({ status: 'uploaded', error: null }).where(eq(planUpload.id, up.id))
    void buildUpload(up.id)
    return reply.code(202).send({ ok: true })
  })
}
