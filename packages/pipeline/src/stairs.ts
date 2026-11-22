import type { Pt } from './pdf'
import type { Box } from './labels'

/** One drawn stroke of a storey, already in house px. `width` is the pen in page points (thin = furniture, medium = railings). */
export interface Stroke { pts: Pt[]; width: number; dashed: boolean; curved: boolean; closed: boolean; layer: string }

/** A straight run of steps: tread lines `at` (sorted) across the run, each spanning lo…hi. axis = the direction you walk. */
export interface Flight { axis: 'x' | 'y'; at: number[]; lo: number; hi: number; box: Box }
export interface Stair { box: Box; flights: Flight[]; /** treads in climbing order (house px rects) when the up-arrow was found; else drawing order */ treads: Box[]; ordered: boolean }

type Seg = { o: 'h' | 'v'; at: number; lo: number; hi: number; width: number; dashed: boolean }
const segments = (strokes: Stroke[], min: number): Seg[] => {
  const out: Seg[] = []
  for (const s of strokes) {
    if (s.curved) continue
    for (let i = 0; i + 1 < s.pts.length + (s.closed ? 1 : 0); i++) {
      const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length], dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1])
      if (dy < 1 && dx >= min) out.push({ o: 'h', at: (a[1] + b[1]) / 2, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]), width: s.width, dashed: s.dashed })
      else if (dx < 1 && dy >= min) out.push({ o: 'v', at: (a[0] + b[0]) / 2, lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]), width: s.width, dashed: s.dashed })
    }
  }
  return out
}

/**
 * Stairs: four or more parallel lines of one length, evenly 20–36 cm apart, are a flight; flights that touch are one
 * stair. The climbing order follows the architect's up-arrow (a long bent line that starts at a small circle).
 */
export function findStairs(strokes: Stroke[]): Stair[] {
  const segs = segments(strokes, 55).filter(s => s.hi - s.lo <= 170 && !s.dashed)
  const flights: Flight[] = []
  for (const o of ['h', 'v'] as const) {
    // lines with the same span
    const pool = segs.filter(s => s.o === o).sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.at - b.at)
    const groups: Seg[][] = []
    for (const s of pool) { const g = groups.find(g => Math.abs(g[0].lo - s.lo) < 5 && Math.abs(g[0].hi - s.hi) < 5); if (g) g.push(s); else groups.push([s]) }
    for (const g of groups) {
      const at = [...new Set(g.map(s => Math.round(s.at)))].sort((a, b) => a - b)
      let run: number[] = []
      const flush = () => {
        if (run.length >= 4) flights.push({ axis: o === 'v' ? 'x' : 'y', at: run, lo: g[0].lo, hi: g[0].hi, box: o === 'v' ? [run[0], g[0].lo, run[run.length - 1], g[0].hi] : [g[0].lo, run[0], g[0].hi, run[run.length - 1]] })
        run = []
      }
      for (const v of at) {
        const step = run.length ? v - run[run.length - 1] : 0
        if (run.length && (step < 20 || step > 36 || (run.length >= 2 && Math.abs(step - (run[1] - run[0])) > 4))) flush()
        run.push(v)
      }
      flush()
    }
  }
  // flights that touch (≤ 45 px apart) are one stair
  const parent = flights.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const gap = (a: Box, b: Box) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]), Math.max(a[1], b[1]) - Math.min(a[3], b[3]))
  for (let i = 0; i < flights.length; i++) for (let k = i + 1; k < flights.length; k++) if (gap(flights[i].box, flights[k].box) <= 45) parent[find(i)] = find(k)
  const stairs = new Map<number, Flight[]>()
  flights.forEach((f, i) => stairs.set(find(i), [...(stairs.get(find(i)) ?? []), f]))
  return [...stairs.values()].map(fs => {
    const box: Box = [Math.min(...fs.map(f => f.box[0])), Math.min(...fs.map(f => f.box[1])), Math.max(...fs.map(f => f.box[2])), Math.max(...fs.map(f => f.box[3]))]
    const treads: Box[] = fs.flatMap(f => f.at.slice(0, -1).map((v, i): Box => (f.axis === 'x' ? [v, f.lo, f.at[i + 1], f.hi] : [f.lo, v, f.hi, f.at[i + 1]])))
    const path = upArrow(strokes, box)
    if (path) { const t = (b: Box) => along(path, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]); treads.sort((a, b) => t(a) - t(b)) }
    return { box, flights: fs, treads, ordered: !!path }
  })
}

/** The up-arrow of a stair: a bent line (≥ 2 corners, long) inside the stair with a small circle at its start. */
function upArrow(strokes: Stroke[], box: Box): Pt[] | null {
  const inside = (p: Pt, m = 40) => p[0] > box[0] - m && p[0] < box[2] + m && p[1] > box[1] - m && p[1] < box[3] + m
  const dots = strokes.filter(s => s.curved).map(s => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of s.pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y) } return { c: [(x1 + x2) / 2, (y1 + y2) / 2] as Pt, size: Math.max(x2 - x1, y2 - y1) } }).filter(d => d.size <= 40 && inside(d.c))
  if (!dots.length) return null
  // the arrow may be drawn as separate strokes: chain straight pieces end to end, starting at the circle
  const pieces: Array<[Pt, Pt]> = []
  for (const s of strokes) { if (s.curved) continue; for (let i = 0; i + 1 < s.pts.length; i++) if (inside(s.pts[i]) && inside(s.pts[i + 1]) && Math.hypot(s.pts[i + 1][0] - s.pts[i][0], s.pts[i + 1][1] - s.pts[i][1]) > 12) pieces.push([s.pts[i], s.pts[i + 1]]) }
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
  let best: { pts: Pt[]; len: number } | null = null
  for (const dot of dots) for (let i = 0; i < pieces.length; i++) for (const flip of [false, true]) {
    const first = flip ? [pieces[i][1], pieces[i][0]] : pieces[i]
    if (d(first[0], dot.c) > dot.size / 2 + 8) continue
    const used = new Set([i]), pts: Pt[] = [first[0], first[1]]
    for (let grew = true; grew;) {
      grew = false
      const end = pts[pts.length - 1], prev = pts[pts.length - 2]
      for (let k = 0; k < pieces.length; k++) {
        if (used.has(k)) continue
        const [a, b] = pieces[k], next = d(a, end) < 3 ? b : d(b, end) < 3 ? a : null
        if (!next || d(next, prev) < 3) continue
        used.add(k); pts.push(next); grew = true; break
      }
    }
    let len = 0; for (let k = 0; k + 1 < pts.length; k++) len += d(pts[k], pts[k + 1])
    if (pts.length >= 3 && len >= 150 && (!best || len > best.len)) best = { pts, len }
  }
  return best?.pts ?? null
}

/** Arc length along a polyline of the point on it nearest to p. */
function along(path: Pt[], p: Pt): number {
  let best = Infinity, at = 0, run = 0
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len)))
    const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1])
    if (d < best) { best = d; at = run + t * len }
    run += len
  }
  return at
}

/**
 * Railings: two parallel lines 3–11 cm apart drawn with a medium pen (heavier than furniture, lighter than walls),
 * at least 80 cm long. Returned as thin boxes.
 */
export function findRailings(strokes: Stroke[]): Box[] {
  const segs = segments(strokes.filter(s => s.width >= .45 && s.width < 1.2 && !s.dashed), 60)
  const out: Box[] = []
  const used = new Set<number>()
  for (let i = 0; i < segs.length; i++) for (let k = i + 1; k < segs.length; k++) {
    const a = segs[i], b = segs[k]
    if (a.o !== b.o || used.has(i) || used.has(k)) continue
    const d = Math.abs(a.at - b.at), lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi)
    if (d < 2.5 || d > 11 || hi - lo < 80) continue
    used.add(i); used.add(k)
    const p = Math.min(a.at, b.at), q = Math.max(a.at, b.at)
    out.push(a.o === 'h' ? [Math.min(a.lo, b.lo), p, Math.max(a.hi, b.hi), q] : [p, Math.min(a.lo, b.lo), q, Math.max(a.hi, b.hi)])
  }
  return out
}
