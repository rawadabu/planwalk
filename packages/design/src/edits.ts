import type { House } from '@planwalk/house'
import { applyRun, checkRun, type Run } from './kitchen'

/**
 * Geometry edits (sheet A-04b). A design never touches the architect's base: these edits are applied to a copy,
 * giving the "effective house" that the viewer, the area table and (later) the cost and the carpenter PDF use.
 *
 *   window  change one opening: width (cm, kept centred), sill and head height (m), opening type
 *   wall    move an interior partition sideways by `by` cm (both faces move; walls meeting it stretch)
 */
export type WindowType = 'sliding' | 'hinged' | 'fixed'
export interface WindowEdit { k: 'window'; floor: 0 | 1 | 2; index: number; width?: number; sill?: number; head?: number; type?: WindowType }
export interface WallEdit { k: 'wall'; floor: 0 | 1 | 2; axis: 'x' | 'y'; a: number; b: number; lo: number; hi: number; by: number }
export type Edit = WindowEdit | WallEdit | Run
export interface EditIssue { key: string; level: 'error' | 'warning'; message: string }

export const PX_PER_CM = 437 / 440            // plan px per cm (437 px = 440 cm on the twin-house plan)
const H = 2.8, TOL = 1.6
export const MIN_WINDOW_CM = 40, MAX_MOVE_CM = 150, MIN_ROOM_CM = 120

/** Stable key per edited element: one edit per window, one per partition. */
export const editKey = (e: Edit) => e.k === 'window' ? `window:f${e.floor}.${e.index}` : e.k === 'run' ? `run:f${e.floor}.${e.id}` : `wall:f${e.floor}.${e.axis}${Math.round(e.a)}.${Math.round(e.lo)}`

/** A window as the UI shows it (cm and m), from a house. */
export function windowInfo(house: House, floor: 0 | 1 | 2, index: number) {
  const g = house.floors[floor].glass[index]; if (!g) return null
  const [x1, y1, x2, y2, sill, head] = g, horiz = x2 - x1 > y2 - y1
  return { width: Math.round((horiz ? x2 - x1 : y2 - y1) / PX_PER_CM), sill, head, horiz }
}

/**
 * The partition behind a wall face: the face hit at `at` (axis 'x' = a face of constant x) around `along`,
 * plus the parallel face on the other side of the wall. Interior only: both sides must be indoor rooms.
 */
export function findPartition(house: House, floor: 0 | 1 | 2, axis: 'x' | 'y', at: number, along: number):
  | { ok: true; wall: Omit<WallEdit, 'k' | 'by'> & { thickness: number } }
  | { ok: false; reason: string } {
  const fl = house.floors[floor]
  const edges: Array<{ c: number; lo: number; hi: number }> = []
  for (const p of fl.walls) for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length]
    if (axis === 'x' && Math.abs(ax - bx) < .5) edges.push({ c: ax, lo: Math.min(ay, by), hi: Math.max(ay, by) })
    if (axis === 'y' && Math.abs(ay - by) < .5) edges.push({ c: ay, lo: Math.min(ax, bx), hi: Math.max(ax, bx) })
  }
  const face = edges.filter(e => Math.abs(e.c - at) < 3 && along >= e.lo - 1 && along <= e.hi + 1).sort((p, q) => Math.abs(p.c - at) - Math.abs(q.c - at))[0]
  if (!face) return { ok: false, reason: 'No straight wall face here' }
  // the opposite face: closest parallel edge 6–35 px away that overlaps around the same spot
  const opp = edges.filter(e => Math.abs(e.c - face.c) >= 6 && Math.abs(e.c - face.c) <= 35 && along >= e.lo - 1 && along <= e.hi + 1)
    .sort((p, q) => Math.abs(p.c - face.c) - Math.abs(q.c - face.c))[0]
  if (!opp) return { ok: false, reason: 'This wall has only one face here (it may be an outside wall)' }
  // the whole run of both faces moves together (faces can differ in length where a door jamb or a jog meets them)
  const a = Math.min(face.c, opp.c), b = Math.max(face.c, opp.c), lo = Math.min(face.lo, opp.lo), hi = Math.max(face.hi, opp.hi)
  const indoor = (x: number, y: number) => fl.rooms.slice(0, fl.indoor).some(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5])
  const mid = (lo + hi) / 2
  const sideA = axis === 'x' ? indoor(a - 8, mid) : indoor(mid, a - 8), sideB = axis === 'x' ? indoor(b + 8, mid) : indoor(mid, b + 8)
  if (!sideA || !sideB) return { ok: false, reason: 'Outside walls stay where the architect drew them' }
  return { ok: true, wall: { floor, axis, a, b, lo, hi, thickness: Math.round((b - a) / PX_PER_CM) } }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** Apply edits to a copy of the base. Errors mean the edit was skipped; warnings are applied but flagged. */
export function applyEdits(base: House, edits: Record<string, Edit>): { house: House; issues: EditIssue[]; windowTypes: Record<string, WindowType> } {
  const house = clone(base), issues: EditIssue[] = [], windowTypes: Record<string, WindowType> = {}
  // walls first (they can carry windows with them), then windows
  const order = { wall: 0, window: 1, run: 2 }
  const list = Object.entries(edits).sort(([, p], [, q]) => order[p.k] - order[q.k])
  for (const [key, e] of list) {
    const err = (message: string) => issues.push({ key, level: 'error', message })
    const fl = house.floors[e.floor]
    if (!fl) { err('Unknown storey'); continue }

    if (e.k === 'run') {
      applyRun(house, e)
      for (const i of checkRun(e, house)) issues.push({ key, level: i.level, message: `Kitchen: ${i.message}` })
      continue
    }
    if (e.k === 'window') {
      const g = fl.glass[e.index]; if (!g) { err('That window is not in this house'); continue }
      let [x1, y1, x2, y2, sill, head] = g
      const horiz = x2 - x1 > y2 - y1
      if (e.type) windowTypes[`${e.floor}.${e.index}`] = e.type
      if (e.sill != null) sill = e.sill
      if (e.head != null) head = e.head
      if (sill < 0 || sill > 1.6) { err('Sill height must be between 0 and 160 cm'); continue }
      if (head > H - .05 || head - sill < .4) { err('Window head must be at least 40 cm above the sill and below the ceiling'); continue }
      if (e.width != null) {
        if (e.width < MIN_WINDOW_CM) { err(`A window is at least ${MIN_WINDOW_CM} cm wide`); continue }
        const [lo0, hi0] = horiz ? [x1, x2] : [y1, y2], [b0, b1] = horiz ? [y1, y2] : [x1, x2]
        const c = (lo0 + hi0) / 2, half = e.width * PX_PER_CM / 2, lo = c - half, hi = c + half
        // the opening's edges are wall-polygon vertices; widening may not swallow another corner of the wall
        const vs = fl.walls.flatMap(p => p)
        const onBand = (v: number[]) => (horiz ? v[1] : v[0]) >= b0 - 5 && (horiz ? v[1] : v[0]) <= b1 + 5
        const along = (v: number[]) => (horiz ? v[0] : v[1])
        // the opening's real ends in the wall polygon (the glass rectangle is traced a few px off)
        const near = (t: number) => vs.filter(onBand).map(along).filter(a => Math.abs(a - t) < 6).sort((p, q) => Math.abs(p - t) - Math.abs(q - t))[0]
        const endLo = near(lo0), endHi = near(hi0)
        if (endLo == null || endHi == null) { err('The opening for this window was not found in the wall'); continue }
        const nLo = lo + (endLo - lo0), nHi = hi + (endHi - hi0)
        const blocked = vs.some(v => onBand(v) && ((along(v) > nLo + TOL && along(v) < endLo - TOL) || (along(v) < nHi - TOL && along(v) > endHi + TOL)))
        const otherGlass = fl.glass.some((o, i) => i !== e.index && (horiz ? Math.abs(o[1] - y1) < 4 : Math.abs(o[0] - x1) < 4) && (horiz ? o[0] < hi && o[2] > lo : o[1] < hi && o[3] > lo))
        if (blocked || otherGlass) { err('There is no room in this wall to make the window that wide'); continue }
        for (const p of fl.walls) for (const v of p) if (onBand(v)) {
          if (Math.abs(along(v) - endLo) < .01) horiz ? (v[0] = nLo) : (v[1] = nLo)
          else if (Math.abs(along(v) - endHi) < .01) horiz ? (v[0] = nHi) : (v[1] = nHi)
        }
        if (horiz) { x1 = lo; x2 = hi } else { y1 = lo; y2 = hi }
      }
      fl.glass[e.index] = [x1, y1, x2, y2, sill, head]
      continue
    }

    // move a partition: both faces (a, b) between lo and hi
    if (Math.abs(e.by) > MAX_MOVE_CM) { err(`Walls move at most ${MAX_MOVE_CM} cm`); continue }
    const d = e.by * PX_PER_CM, ax = e.axis === 'x' ? 0 : 1, ox = 1 - ax
    const faces = [e.a, e.b]
    let moved = 0
    // rooms on either side shrink / grow; refuse if one gets too narrow
    const touching = fl.rooms.map((r, i) => ({ r: r as unknown as [string, string, number, number, number, number] & number[], i })).filter(({ r, i }) => i < fl.indoor && r[2 + ox] < e.hi && r[4 + ox] > e.lo)
    const before = touching.filter(({ r }) => Math.abs(r[4 + ax] - e.a) < 25), after = touching.filter(({ r }) => Math.abs(r[2 + ax] - e.b) < 25)
    const tooSmall = [...before.map(({ r }) => (r[4 + ax] + d - r[2 + ax]) / PX_PER_CM), ...after.map(({ r }) => (r[4 + ax] - r[2 + ax] - d) / PX_PER_CM)].some(w => w < MIN_ROOM_CM)
    if (!before.length || !after.length) { err('This wall no longer separates two rooms here'); continue }
    if (tooSmall) { err(`A room would become narrower than ${MIN_ROOM_CM} cm`); continue }
    for (const p of fl.walls) for (const v of p) {
      if (faces.some(c => Math.abs(v[ax] - c) < TOL) && v[ox] >= e.lo - TOL && v[ox] <= e.hi + TOL) { v[ax] += d; moved++ }
    }
    if (moved < 4) { err('The wall could not be found in the plan'); continue }
    for (const g of fl.glass as number[][]) if (g[ax] >= e.a - TOL && g[2 + ax] <= e.b + TOL && g[ox] >= e.lo - TOL && g[2 + ox] <= e.hi + TOL) { g[ax] += d; g[2 + ax] += d }
    const relabel = (r: any, dim: 'w' | 'h', delta: number) => {
      const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/.exec(r[1]); if (!m) return
      const w = (r[4] - r[2]) / PX_PER_CM, h = (r[5] - r[3]) / PX_PER_CM, a1 = +m[1], b1 = +m[2]
      const firstIsW = Math.abs(a1 - w) + Math.abs(b1 - h) <= Math.abs(a1 - h) + Math.abs(b1 - w)
      const na = firstIsW === (dim === 'w') ? a1 + delta : a1, nb = firstIsW === (dim === 'w') ? b1 : b1 + delta
      r[1] = `${Math.round(na)} × ${Math.round(nb)}`
    }
    const dim = ax === 0 ? 'w' : 'h'
    for (const { r } of before) { relabel(r, dim, e.by); r[4 + ax] += d }
    for (const { r } of after) { relabel(r, dim, -e.by); r[2 + ax] += d }
    // furniture standing where the wall now is
    const band = [Math.min(e.a, e.a + d), Math.max(e.b, e.b + d)]
    const hit = house.items.some(it => it.f === e.floor && 'r' in it && it.k === 'model' && it.r[ax] < band[1] && it.r[2 + ax] > band[0] && it.r[ox] < e.hi && it.r[2 + ox] > e.lo)
    if (hit) issues.push({ key, level: 'warning', message: 'Furniture stands where the wall now is; move it in the room' })
  }
  return { house, issues, windowTypes }
}
