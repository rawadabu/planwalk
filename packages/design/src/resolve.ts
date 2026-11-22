import { BASE, PART_IDS, finish, type Look, type Part } from './catalog'
import { targetKey, type Design, type Scope } from './schema'

/** The finish id that applies to a part at a scope: room → storey → whole house → base. */
export function resolveFinish(design: Design, part: Part, scope: Scope = {}): { id: string; from: 'room' | 'floor' | 'all' | 'base' } {
  const d = design.finishes
  if (scope.floor != null && scope.room != null) { const v = d[targetKey(part, scope)]; if (v) return { id: v, from: 'room' } }
  if (scope.floor != null) { const v = d[targetKey(part, { floor: scope.floor })]; if (v) return { id: v, from: 'floor' } }
  const v = d[targetKey(part)]; if (v) return { id: v, from: 'all' }
  return { id: BASE[part], from: 'base' }
}

/** Per part, per storey: the look to draw (null = keep the base model's own material). For the 3D engine. */
export type StoreyLooks = Partial<Record<Part, [Look | null, Look | null, Look | null]>>
export function storeyLooks(design: Design): StoreyLooks {
  const out: StoreyLooks = {}
  for (const part of PART_IDS) {
    const row = ([0, 1, 2] as const).map(f => {
      const r = resolveFinish(design, part, { floor: f })
      return r.from === 'base' ? null : finish(r.id)?.look ?? null
    }) as [Look | null, Look | null, Look | null]
    if (row.some(Boolean)) out[part] = row
  }
  return out
}

/** Parts that can differ per room (the rest are per storey or the whole house). */
export const ROOM_PARTS = ['floor', 'walls', 'ceiling'] as const
export type RoomPart = (typeof ROOM_PARTS)[number]
/** Room-level choices for the 3D engine: drawn over the storey's finish. */
export function roomLooks(design: Design): Array<{ part: RoomPart; floor: 0 | 1 | 2; room: number; look: Look }> {
  const out: Array<{ part: RoomPart; floor: 0 | 1 | 2; room: number; look: Look }> = []
  for (const [key, id] of Object.entries(design.finishes)) {
    const m = /^(floor|walls|ceiling)@f([0-2])\.r(\d+)$/.exec(key)
    const look = m && finish(id)?.look
    if (m && look) out.push({ part: m[1] as RoomPart, floor: Number(m[2]) as 0 | 1 | 2, room: Number(m[3]), look })
  }
  return out
}
