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

export const Design = z.object({
  format: z.literal('design@1'),
  finishes: z.record(z.string().regex(TARGET, 'Unknown target'), z.string().min(1).max(64)).default({}),
  note: z.string().max(2000).optional(),
})
export type Design = z.infer<typeof Design>
export const emptyDesign = (): Design => ({ format: 'design@1', finishes: {} })
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
