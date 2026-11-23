import { z } from 'zod'
import { PART_IDS, type Part } from './catalog'

/**
 * design@1 — a set of choices layered over a house@1 base model. The base is never modified.
 *
 * finishes: target → finish id. A target is "<part>@<scope>":
 *   scope "all"        the whole house
 *         "f1"         one storey (0 ground, 1 first, 2 second)
 *         "f1.r6"      one room (index into house.floors[1].rooms)
 * The most specific target wins: room, then storey, then whole house, then the base.
 */
export const TARGET = new RegExp(`^(${PART_IDS.join('|')})@(all|f[0-2](?:\\.r\\d{1,3})?)$`)
export type Scope = { floor?: 0 | 1 | 2; room?: number }

const Storey = z.union([z.literal(0), z.literal(1), z.literal(2)])
export const EditSchema = z.discriminatedUnion('k', [
  z.object({ k: z.literal('window'), floor: Storey, index: z.number().int().min(0), width: z.number().optional(), sill: z.number().optional(), head: z.number().optional(), type: z.enum(['sliding', 'hinged', 'fixed']).optional() }),
  z.object({ k: z.literal('wall'), floor: Storey, axis: z.enum(['x', 'y']), a: z.number(), b: z.number(), lo: z.number(), hi: z.number(), by: z.number() }),
  z.object({ k: z.literal('run'), floor: Storey, id: z.string().max(20), x: z.number(), y: z.number(), axis: z.enum(['x', 'y']), length: z.number().positive().max(2000), depth: z.number().min(30).max(80),
    facing: z.union([z.literal(1), z.literal(-1)]), uppers: z.boolean().default(false),
    modules: z.array(z.object({ t: z.enum(['drawers', 'doors', 'sink', 'hob', 'dishwasher', 'corner', 'fridge', 'oven', 'pantry', 'filler']), w: z.number().positive().max(200) })).max(40) }),
  // furniture: a piece of the plan moved / turned (quarter turns) / removed, or a new piece from the catalogue
  z.object({ k: z.literal('item'), floor: Storey, ref: z.string().regex(/^[\w.-]{1,38}$/), dx: z.number().min(-6000).max(6000), dy: z.number().min(-6000).max(6000), turn: z.number().int().min(0).max(3).optional(), remove: z.boolean().optional() }),
  z.object({ k: z.literal('add'), floor: Storey, id: z.string().regex(/^[\w-]{1,20}$/), thing: z.string().max(30), x: z.number().min(-9000).max(12000), y: z.number().min(-9000).max(12000), turn: z.number().int().min(0).max(3), out: z.boolean().optional() }),
])
export const Design = z.object({
  format: z.literal('design@1'),
  finishes: z.record(z.string().regex(TARGET, 'Unknown target'), z.string().min(1).max(64)).default({}),
  /** edits keyed by editKey(): window:f1.3, wall:f2.x545.703, item:f1.sofa-412-380, add:f0.k3x9 */
  edits: z.record(z.string().regex(/^(window|wall|run|item|add):f[0-2]\.[\w.-]{1,40}$/).max(60), EditSchema).refine(e => Object.keys(e).length <= 600, 'Too many edits').default({}),
  note: z.string().max(2000).optional(),
})
export type Design = z.infer<typeof Design>
export const emptyDesign = (): Design => ({ format: 'design@1', finishes: {}, edits: {} })
export function parseDesign(data: unknown): Design { return Design.parse(data) }

export function targetKey(part: Part, scope: Scope = {}): string {
  if (scope.floor == null) return `${part}@all`
  return scope.room == null ? `${part}@f${scope.floor}` : `${part}@f${scope.floor}.r${scope.room}`
}
export function parseTarget(key: string): { part: Part; floor?: 0 | 1 | 2; room?: number } | null {
  const m = TARGET.exec(key); if (!m) return null
  const part = m[1] as Part
  if (m[2] === 'all') return { part }
  const [fs, rs] = m[2].split('.')
  return { part, floor: Number(fs.slice(1)) as 0 | 1 | 2, ...(rs ? { room: Number(rs.slice(1)) } : {}) }
}
