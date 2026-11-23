import type { House } from '@planwalk/house'
import { PX_PER_M, type Plan } from './sheet'

/**
 * Where a photographer would stand in each room: as far back as the room allows, clear of walls and furniture, with a
 * free line of sight to the middle of the room. One view per indoor room; positions are house px (per storey).
 */
export interface RoomView { id: string; name: string; storey: number; pos: [number, number]; target: [number, number]; area: number; wide: boolean }

const STEP = 30, CLEAR = 38                  // px: candidate spacing, clearance from walls

export function roomViews(plan: Plan, house: House): RoomView[] {
  const out: RoomView[] = []
  for (const st of plan.storeys) {
    const inPoly = (p: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
    const wall = (x: number, y: number) => st.walls.some(p => inPoly(p, x, y))
    // things you can't stand in or see through at eye height
    const solids = house.items.filter(it => it.f === st.storey && 'r' in it && (it.k === 'tall' || it.k === 'model' || (it.k === 'cabinet' && ['fridge', 'pantry', 'oven', 'upper'].includes(it.kind)))).map(it => ({ r: (it as { r: number[] }).r, tall: it.k === 'tall' || it.k === 'cabinet' }))
    const inSolid = (x: number, y: number, m: number, onlyTall = false) => solids.some(s => (!onlyTall || s.tall) && x > s.r[0] - m && x < s.r[2] + m && y > s.r[1] - m && y < s.r[3] + m)
    const stairs = st.stairs.map(s => s.box)
    const seen = new Map<string, number>()
    for (const room of st.rooms) {
      if (room.outdoor || room.void || room.area < 3) continue
      const inRoom = (x: number, y: number) => room.tiles.some(t => x >= t[0] && x < t[2] && y >= t[1] && y < t[3])
      // the middle of the room, weighted by its floor
      let sx = 0, sy = 0, sa = 0
      for (const t of room.tiles) { const a = (t[2] - t[0]) * (t[3] - t[1]); sx += a * (t[0] + t[2]) / 2; sy += a * (t[1] + t[3]) / 2; sa += a }
      const target: [number, number] = [sx / sa, sy / sa]
      const sight = (x: number, y: number) => { const n = Math.ceil(Math.hypot(target[0] - x, target[1] - y) / 8); for (let i = 1; i < n; i++) { const px = x + (target[0] - x) * i / n, py = y + (target[1] - y) * i / n; if (wall(px, py) || inSolid(px, py, 0, true)) return false } return true }
      let best: { p: [number, number]; score: number } | null = null
      for (let x = room.rect[0] + STEP / 2; x < room.rect[2]; x += STEP) for (let y = room.rect[1] + STEP / 2; y < room.rect[3]; y += STEP) {
        if (!inRoom(x, y) || inSolid(x, y, 22) || stairs.some(b => x > b[0] - 20 && x < b[2] + 20 && y > b[1] - 20 && y < b[3] + 20)) continue
        if ([[CLEAR, 0], [-CLEAR, 0], [0, CLEAR], [0, -CLEAR], [CLEAR * .7, CLEAR * .7], [-CLEAR * .7, CLEAR * .7], [CLEAR * .7, -CLEAR * .7], [-CLEAR * .7, -CLEAR * .7]].some(([dx, dy]) => wall(x + dx, y + dy))) continue
        const d = Math.hypot(target[0] - x, target[1] - y)
        if (d < 60 || !sight(x, y)) continue
        // far back, and a little off-axis (a view along a diagonal shows two walls)
        const diag = Math.min(Math.abs(target[0] - x), Math.abs(target[1] - y)) / d
        const score = d * (1 + .5 * diag)
        if (!best || score > best.score) best = { p: [x, y], score }
      }
      if (!best) continue
      const n = (seen.get(room.name) ?? 0) + 1; seen.set(room.name, n)
      out.push({ id: `f${st.storey}-${out.length}`, name: room.name, storey: st.storey, pos: [Math.round(best.p[0]), Math.round(best.p[1])], target: [Math.round(target[0]), Math.round(target[1])], area: room.area, wide: room.area < 9 })
    }
  }
  return out
}

/** A view in the engine's world space (metres, y up): camera at eye height, looking slightly down at the target. */
export function toWorld(v: RoomView, level: Record<number, number> = { 0: -3.05, 1: 0, 2: 3.05 }) {
  const k = 1 / PX_PER_M, y = level[v.storey] ?? 0
  return { id: v.id, name: v.name, storey: v.storey, wide: v.wide, pos: [v.pos[0] * k, y + 1.6, v.pos[1] * k], target: [v.target[0] * k, y + 1.15, v.target[1] * k] }
}
