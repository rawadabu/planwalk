import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/client.js'
import { building, house, member, planUpload, project, unit } from '../db/schema.js'
import { requireProject, requireUser, roleIn } from '../lib/guard.js'
import { can } from '../lib/permissions.js'
import { storage } from '../lib/storage.js'
import { config } from '../config.js'
import { buildUpload } from '../lib/build.js'

const CreateProject = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['development', 'private']).default('private'),
  address: z.string().trim().max(200).optional(),
})
const CreateUnit = z.object({
  number: z.string().trim().min(1).max(20),
  buildingName: z.string().trim().max(60).optional(),
  floor: z.number().int().min(-5).max(120).optional(),
  rooms: z.number().min(0).max(20).optional(),
  areaM2: z.number().min(0).max(5000).optional(),
  priceIls: z.number().int().min(0).max(1_000_000_000).optional(),
  houseId: z.string().optional(),
})
const UpdateUnit = z.object({ status: z.enum(['available', 'reserved', 'sold']).optional(), priceIls: z.number().int().min(0).max(1_000_000_000).nullable().optional() })

export async function projectRoutes(app: FastifyInstance) {
  // Projects of every organization I belong to (or one org with ?org=)
  app.get<{ Querystring: { org?: string } }>('/api/projects', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const mine = db.select({ id: member.organizationId }).from(member).where(eq(member.userId, s.user.id))
    const rows = await db.select({
      id: project.id, organizationId: project.organizationId, name: project.name, kind: project.kind, address: project.address, createdAt: project.createdAt,
      units: sql<number>`(select count(*)::int from ${unit} where ${unit.projectId} = ${project.id})`,
      houses: sql<number>`(select count(*)::int from ${house} where ${house.projectId} = ${project.id})`,
    }).from(project)
      .where(req.query.org ? and(eq(project.organizationId, req.query.org), inArray(project.organizationId, mine)) : inArray(project.organizationId, mine))
      .orderBy(desc(project.createdAt))
    return rows
  })

  app.post('/api/projects', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const body = CreateProject.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Give the project a name', details: body.error.issues })
    const role = await roleIn(s.user.id, body.data.organizationId)
    if (!role || !can(role, 'project', 'create')) return reply.code(403).send({ error: 'You can’t create projects in this organization' })
    const [p] = await db.insert(project).values({ id: randomUUID(), ...body.data, createdBy: s.user.id }).returning()
    return reply.code(201).send(p)
  })

  // Full project: buildings, units, houses, uploads, and my role
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'read'); if (!ctx) return
    const [buildings, units, houses, uploads] = await Promise.all([
      db.select().from(building).where(eq(building.projectId, ctx.project.id)).orderBy(building.sort),
      db.select().from(unit).where(eq(unit.projectId, ctx.project.id)).orderBy(unit.number),
      db.select().from(house).where(eq(house.projectId, ctx.project.id)),
      db.select().from(planUpload).where(eq(planUpload.projectId, ctx.project.id)).orderBy(desc(planUpload.createdAt)),
    ])
    return { ...ctx.project, role: ctx.role, buildings, units, houses, uploads }
  })

  // Location (address → lat/lng) and plan orientation, for the real sun path
  const ProjectPatch = z.object({
    name: z.string().trim().min(1).max(120).optional(), address: z.string().trim().max(200).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional(),
    northDeg: z.number().min(-360).max(360).nullable().optional(),
  })
  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    const b = ProjectPatch.safeParse(req.body)
    if (!b.success) return reply.code(400).send({ error: 'Check the project details' })
    const [row] = await db.update(project).set({ ...b.data, updatedAt: new Date() }).where(eq(project.id, ctx.project.id)).returning()
    return row
  })

  // Address search (OpenStreetMap Nominatim). Signed-in users only; results are suggestions the user confirms.
  app.get<{ Querystring: { q?: string } }>('/api/geocode', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const q = (req.query.q ?? '').trim()
    if (q.length < 3 || q.length > 200) return reply.code(400).send({ error: 'Type an address' })
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=he,en&q=${encodeURIComponent(q)}`,
        { headers: { 'user-agent': 'Planwalk/0.1 (address lookup)' }, signal: AbortSignal.timeout(6000) })
      if (!r.ok) throw new Error(String(r.status))
      const list = (await r.json()) as Array<{ display_name: string; lat: string; lon: string }>
      return list.map(x => ({ label: x.display_name, lat: +x.lat, lng: +x.lon }))
    } catch {
      return reply.code(502).send({ error: "Address search isn't reachable right now. You can type the coordinates instead." })
    }
  })

  app.post<{ Params: { id: string } }>('/api/projects/:id/units', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    const body = CreateUnit.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Check the unit details', details: body.error.issues })
    const { buildingName, ...u } = body.data
    let buildingId: string | null = null
    if (buildingName) {
      const [b] = await db.select().from(building).where(and(eq(building.projectId, ctx.project.id), eq(building.name, buildingName))).limit(1)
      buildingId = b?.id ?? (await db.insert(building).values({ id: randomUUID(), projectId: ctx.project.id, name: buildingName }).returning())[0].id
    }
    if (u.houseId) {
      const [h] = await db.select().from(house).where(and(eq(house.id, u.houseId), eq(house.projectId, ctx.project.id))).limit(1)
      if (!h) return reply.code(400).send({ error: 'That 3D model is not part of this project' })
    }
    const [row] = await db.insert(unit).values({ id: randomUUID(), projectId: ctx.project.id, buildingId, ...u }).returning()
    return reply.code(201).send(row)
  })

  app.patch<{ Params: { id: string } }>('/api/units/:id', async (req, reply) => {
    const [u] = await db.select().from(unit).where(eq(unit.id, req.params.id)).limit(1)
    if (!u) return reply.code(404).send({ error: 'Unit not found' })
    const ctx = await requireProject(req, reply, u.projectId, 'unit', 'update'); if (!ctx) return
    const body = UpdateUnit.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Check the unit details' })
    const [row] = await db.update(unit).set(body.data).where(eq(unit.id, u.id)).returning()
    return row
  })

  // Upload the architect's plans (PDF) → starts the processing pipeline (status: uploaded)
  app.post<{ Params: { id: string } }>('/api/projects/:id/uploads', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'upload', 'create'); if (!ctx) return
    const part = await req.file({ limits: { fileSize: config.maxUploadBytes, files: 1 } })
    if (!part) return reply.code(400).send({ error: 'Attach the plans as a PDF' })
    const buf = await part.toBuffer()
    if (part.file.truncated) return reply.code(413).send({ error: 'The file is larger than 50 MB' })
    if (buf.subarray(0, 5).toString() !== '%PDF-') return reply.code(400).send({ error: 'Upload the plans as a PDF file' })
    const id = randomUUID()
    const key = `projects/${ctx.project.id}/${id}.pdf`
    await storage.write(key, buf)
    const [row] = await db.insert(planUpload).values({ id, projectId: ctx.project.id, fileKey: key, fileName: part.filename.replace(/[^\w.\- ]/g, '_').slice(0, 120), sizeBytes: buf.length, createdBy: ctx.session.user.id }).returning()
    void buildUpload(row.id)                                 // build in the background; the page polls /api/uploads/:id
    return reply.code(201).send(row)
  })
}
