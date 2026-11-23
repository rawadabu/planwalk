import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { parseHouse, type House } from '@planwalk/house'
import { carryDesign, parseDesign, planChanges, type PlanChanges } from '@planwalk/design'
import { db } from '../db/client.js'
import { design, designRevision, house, houseVersion, planUpload, project, projectMember, user } from '../db/schema.js'
import { storage } from './storage.js'
import { sendMail } from './mailer.js'
import { config } from '../config.js'

/**
 * Plan versions. Updated plans are built as a draft house (house.draftOf) the architect reviews like any other;
 * publishing swaps them in as the next version of the real house: the previous plan is kept for comparison, every
 * saved design is carried over, and the clients are told what changed.
 */
const PLAN_FILE = /^(house|plan|plan\.full|views)\.json$|^[a-z0-9_.-]+\.svg$/i
const dir = (houseId: string, n?: number) => (n == null ? `houses/${houseId}` : `houses/${houseId}/v${n}`)
const readHouse = async (key: string): Promise<House> => parseHouse(JSON.parse((await storage.read(key)).toString()))
async function copyPlan(from: string, to: string, rewrite?: (h: House) => House) {
  for (const f of await storage.list(from)) {
    if (!PLAN_FILE.test(f)) continue
    if (f === 'house.json' && rewrite) await storage.write(`${to}/${f}`, JSON.stringify(rewrite(await readHouse(`${from}/${f}`))))
    else await storage.write(`${to}/${f}`, await storage.read(`${from}/${f}`))
  }
}
/** Keep the live plan of a house as version n (for "before / after"). */
export async function snapshot(houseId: string, n: number, force = false) {
  if (n < 1 || (!force && await storage.exists(`${dir(houseId, n)}/house.json`))) return
  await copyPlan(dir(houseId), dir(houseId, n))
}

export interface DesignCarry { designId: string; name: string; by: string | null; author: string | null; kept: number; dropped: Array<{ key: string; what: string }> }
export interface UpdatePreview { target: { id: string; title: string; version: number }; number: number; changes: PlanChanges; designs: DesignCarry[]; clients: number }

async function carryAll(targetId: string, prev: House, next: House) {
  const rows = await db.select({ id: design.id, name: design.name, data: design.data, version: design.version, createdBy: design.createdBy, author: user.name }).from(design).leftJoin(user, eq(user.id, design.createdBy)).where(eq(design.houseId, targetId))
  return rows.map(d => { const c = carryDesign(prev, next, parseDesign(d.data)); return { row: d, carried: c, info: { designId: d.id, name: d.name, by: d.createdBy, author: d.author, kept: c.kept, dropped: c.dropped } satisfies DesignCarry } })
}
const clientsOf = (projectId: string) => db.select({ id: user.id, name: user.name, email: user.email }).from(projectMember).innerJoin(user, eq(user.id, projectMember.userId)).where(eq(projectMember.projectId, projectId))

/** For the review screen of updated plans: what the clients will be told, before anything is published. */
export async function previewUpdate(uploadId: string): Promise<UpdatePreview | null> {
  const [up] = await db.select().from(planUpload).where(eq(planUpload.id, uploadId)).limit(1)
  if (!up?.houseId) return null
  const [h] = await db.select().from(house).where(eq(house.id, up.houseId)).limit(1)
  if (!h?.draftOf) return null
  const [t] = await db.select().from(house).where(eq(house.id, h.draftOf)).limit(1); if (!t) return null
  const prev = await readHouse(`${dir(t.id)}/house.json`), next = await readHouse(`${dir(h.id)}/house.json`)
  return { target: { id: t.id, title: t.title, version: t.version }, number: t.version + 1, changes: planChanges(prev, next), designs: (await carryAll(t.id, prev, next)).map(d => d.info).filter(d => d.kept + d.dropped.length > 0), clients: (await clientsOf(up.projectId)).length }
}

export interface Published { houseId: string; number: number; changes: PlanChanges | null; notified: number; link: string }

/** The architect approved the plans. First plans become version 1; updated plans replace the house as the next version. */
export async function publishUpload(uploadId: string, by: { id: string; name: string }, opts: { note?: string; notify?: boolean } = {}): Promise<Published | null> {
  const [up] = await db.select().from(planUpload).where(eq(planUpload.id, uploadId)).limit(1)
  if (!up?.houseId) return null
  const [h] = await db.select().from(house).where(eq(house.id, up.houseId)).limit(1); if (!h) return null
  const [p] = await db.select().from(project).where(eq(project.id, up.projectId)).limit(1)
  const note = opts.note?.trim() || null
  let houseId = h.id, number = h.version, changes: PlanChanges | null = null, announce = false

  if (h.draftOf) {
    // ── updated plans → the next version of the real house
    const [t] = await db.select().from(house).where(eq(house.id, h.draftOf)).limit(1); if (!t) return null
    houseId = t.id; number = t.version + 1; announce = true
    await snapshot(t.id, t.version)                                              // the plan the clients know, kept as it was
    const prev = await readHouse(`${dir(t.id)}/house.json`)
    await copyPlan(dir(h.id), dir(t.id), nh => ({ ...nh, id: t.id, title: t.title }))
    if (await storage.exists(`${dir(t.id)}/renders.json`)) await storage.write(`${dir(t.id)}/renders.json`, '[]')   // photos of the old plan would mislead
    await snapshot(t.id, number, true)
    const next = await readHouse(`${dir(t.id)}/house.json`)
    changes = planChanges(prev, next)
    const carried = await carryAll(t.id, prev, next)
    await db.transaction(async tx => {
      for (const { row, carried: c } of carried) {
        if (JSON.stringify(c.design) === JSON.stringify(row.data)) continue
        await tx.update(design).set({ data: c.design, version: row.version + 1, updatedAt: new Date() }).where(eq(design.id, row.id))
        await tx.insert(designRevision).values({ id: randomUUID(), designId: row.id, version: row.version + 1, name: row.name, data: c.design, authorId: by.id })
      }
      await tx.insert(houseVersion).values({ id: randomUUID(), houseId: t.id, number, uploadId: up.id, note, changes, carried: Object.fromEntries(carried.map(c => [c.info.designId, { by: c.info.by, dropped: c.info.dropped }])), publishedBy: by.id })
      await tx.update(house).set({ version: number }).where(eq(house.id, t.id))
      await tx.update(planUpload).set({ status: 'ready', houseId: t.id }).where(eq(planUpload.id, up.id))
      await tx.delete(house).where(eq(house.id, h.id))                          // the draft has done its job
    })
  } else if (h.version === 0) {
    // ── first plans → version 1
    number = 1; announce = true
    await snapshot(h.id, 1, true)
    await db.transaction(async tx => {
      await tx.insert(houseVersion).values({ id: randomUUID(), houseId: h.id, number: 1, uploadId: up.id, note, publishedBy: by.id }).onConflictDoNothing()
      await tx.update(house).set({ version: 1 }).where(eq(house.id, h.id))
      await tx.update(planUpload).set({ status: 'ready' }).where(eq(planUpload.id, up.id))
    })
  } else {
    // ── approved again after corrections: the published version follows
    if (await isCurrent(up.id, h.id, h.version)) await snapshot(h.id, h.version, true)
    await db.update(planUpload).set({ status: 'ready' }).where(eq(planUpload.id, up.id))
  }

  const link = `${config.publicUrl}/h/${houseId}`
  let notified = 0
  if (announce && opts.notify !== false && p) {
    const top = (changes?.changes ?? []).slice(0, 8).map(c => `• ${c.where}: ${c.what}`).join('\n')
    const more = changes && changes.changes.length > 8 ? `\nועוד ${changes.changes.length - 8} שינויים.` : ''
    for (const c of await clientsOf(p.id)) {
      const text = number === 1
        ? `שלום ${c.name},\n\n${by.name} סיים/ה להכין את "${p.name}" בתלת-ממד.${note ? `\n\n"${note}"` : ''}\n\nכניסה לבית:\n${link}`
        : `שלום ${c.name},\n\n${by.name} עדכן/ה את התוכנית של "${p.name}" (גרסה ${number}).${note ? `\n\n"${note}"` : ''}${top ? `\n\nמה השתנה:\n${top}${more}` : ''}\n\nהבחירות וההערות שלכם נשמרו. כניסה לבית המעודכן:\n${link}`
      await sendMail(c.email, number === 1 ? `הבית שלכם מוכן לסיור: ${p.name}` : `התוכנית עודכנה: ${p.name} (גרסה ${number})`, text).then(() => { notified++ }).catch(() => {})
    }
  }
  return { houseId, number, changes, notified, link }
}

/** Is this upload the plans behind the version clients see now? (Only those may still be corrected in place.) */
export async function isCurrent(uploadId: string, houseId: string, version: number) {
  const [v] = await db.select({ uploadId: houseVersion.uploadId }).from(houseVersion).where(and(eq(houseVersion.houseId, houseId), eq(houseVersion.number, version))).limit(1)
  return !v || v.uploadId === uploadId || v.uploadId == null
}
