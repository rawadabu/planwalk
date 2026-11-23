import { createHash, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { readLayers, allLabels, readLabels, understand, toHouse, roomViews, toWorld, type Plan, type Read } from '@planwalk/pipeline'
import { db } from '../db/client.js'
import { house, planUpload, project } from '../db/schema.js'
import { storage } from './storage.js'

/**
 * Plans → walkable house. Runs after an upload: reads the PDF's CAD layers, reads its labels (Claude API, cached per
 * file), understands storeys / rooms / openings, and writes the house next to its plan. The upload then waits in
 * `review` for the architect; nothing is shown to clients before that.
 */
export interface BuildReport {
  readings: 'api' | 'cache' | 'none'
  scale: Plan['scale']
  warnings: string[]
  storeys: Array<{ storey: number; name: string; title: string | null; rooms: number; unsureRooms: number; openings: number; unsureOpenings: number; stairs: number }>
}

const strip = (plan: Plan) => ({ ...plan, storeys: plan.storeys.map(({ strokes, ...s }) => s) })
const report = (plan: Plan, readings: BuildReport['readings'], warnings: string[]): BuildReport => ({
  readings, scale: plan.scale, warnings,
  storeys: plan.storeys.map(s => ({
    storey: s.storey, name: s.name, title: s.title, rooms: s.rooms.filter(r => !r.outdoor).length, unsureRooms: s.rooms.filter(r => !r.outdoor && r.from === 'guess').length,
    openings: s.openings.length, unsureOpenings: s.openings.filter(o => !o.sure).length, stairs: s.stairs.length,
  })),
})

/** Write everything derived from a plan: the house, its minimaps, the photo views, and the plan itself (full + public). */
async function writeHouse(houseId: string, plan: Plan, title: string, file: string) {
  const built = toHouse(plan, { id: houseId, title, file })
  const dir = `houses/${houseId}`
  await storage.write(`${dir}/house.json`, JSON.stringify(built.house))
  for (const [name, svg] of Object.entries(built.maps)) await storage.write(`${dir}/${name}`, svg)
  await storage.write(`${dir}/views.json`, JSON.stringify(roomViews(plan, built.house).map(v => toWorld(v))))
  await storage.write(`${dir}/plan.full.json`, JSON.stringify(plan))
  await storage.write(`${dir}/plan.json`, JSON.stringify(strip(plan)))
  return built
}

export async function buildUpload(uploadId: string): Promise<void> {
  const [up] = await db.select().from(planUpload).where(eq(planUpload.id, uploadId)).limit(1)
  if (!up) return
  try {
    await db.update(planUpload).set({ status: 'extracting', error: null }).where(eq(planUpload.id, uploadId))
    const pdf = await storage.read(up.fileKey)
    const L = await readLayers(new Uint8Array(pdf))
    const A = allLabels(L), labels = [...A.text, ...A.dims]
    // label readings: cached per file, so the same plans are never read (or billed) twice
    const cacheKey = `readings/${createHash('sha256').update(pdf).digest('hex')}.json`
    let read = new Map<number, Read>(), source: BuildReport['readings'] = 'none'
    if (await storage.exists(cacheKey)) { read = new Map((JSON.parse((await storage.read(cacheKey)).toString()) as Array<Read & { id: number }>).map(r => [r.id, r])); source = 'cache' }
    else if (process.env.ANTHROPIC_API_KEY && labels.length) {
      read = await readLabels(labels)
      await storage.write(cacheKey, JSON.stringify([...read.values()]))
      source = 'api'
    }
    const plan = understand(L, read)
    const extra = source === 'none' ? ['the labels were not read (no reading key on the server): rooms are unnamed and the scale is taken as 1:100'] : []
    const [p] = await db.select({ name: project.name }).from(project).where(eq(project.id, up.projectId)).limit(1)
    const houseId = up.houseId ?? `p-${randomUUID().slice(0, 8)}`
    const built = await writeHouse(houseId, plan, p?.name ?? up.fileName, up.fileName)
    if (!up.houseId) await db.insert(house).values({ id: houseId, projectId: up.projectId, title: p?.name ?? up.fileName, public: false })
    await db.update(planUpload).set({ status: 'review', houseId, report: report(plan, source, [...built.warnings, ...extra]) }).where(eq(planUpload.id, uploadId))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.update(planUpload).set({ status: 'failed', error: msg.slice(0, 500) }).where(eq(planUpload.id, uploadId)).catch(() => {})
  }
}

/** The architect's corrections on the review screen, applied to the stored plan; the house is rebuilt from it. */
export interface PlanEdits {
  rooms?: Array<{ storey: number; index: number; name: string }>
  openings?: Array<{ storey: number; index: number; kind: 'window' | 'glass-door' }>
}
export async function applyEdits(uploadId: string, edits: PlanEdits): Promise<BuildReport | null> {
  const [up] = await db.select().from(planUpload).where(eq(planUpload.id, uploadId)).limit(1)
  if (!up?.houseId) return null
  const plan = JSON.parse((await storage.read(`houses/${up.houseId}/plan.full.json`)).toString()) as Plan
  for (const e of edits.rooms ?? []) {
    const r = plan.storeys.find(s => s.storey === e.storey)?.rooms[e.index]
    if (r) { r.name = e.name; r.from = 'label' }                          // a name the architect typed is as good as a written one
  }
  for (const e of edits.openings ?? []) {
    const o = plan.storeys.find(s => s.storey === e.storey)?.openings[e.index]
    if (o && o.kind !== 'door') { o.kind = e.kind; o.sill = e.kind === 'glass-door' ? 0 : 1; o.head = e.kind === 'glass-door' ? 2.5 : 2.2; o.sure = true }
  }
  const [p] = await db.select({ name: project.name }).from(project).where(eq(project.id, up.projectId)).limit(1)
  const built = await writeHouse(up.houseId, plan, p?.name ?? up.fileName, up.fileName)
  const prev = (up.report ?? {}) as Partial<BuildReport>
  const next = report(plan, prev.readings ?? 'none', built.warnings)
  await db.update(planUpload).set({ report: next }).where(eq(planUpload.id, uploadId))
  return next
}
