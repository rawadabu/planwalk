import type { PdfLayers, Pt } from './pdf'
import { layerRoles, type Box, type Role } from './labels'

/**
 * Doors and windows as the architect drew them (the door/window CAD layer), not guessed from holes in walls:
 *   a quarter-circle swing            → hinged door (its radius is the leaf width)
 *   a band of parallel lines          → glazing: window or sliding door (told apart later by sill / context)
 *   a small closed circle or hexagon  → a tag bubble (the window schedule number) — kept only as a marker
 */
export interface Opening {
  kind: 'door' | 'glazing'
  box: Box                          // page points
  axis: 'h' | 'v'                   // direction of the wall it sits in
  /** extent along the wall */
  from: number; to: number
  /** position across the wall (centre line of the band / the door's hinge line) */
  at: number
  /** doors: where the hinge is and which way the leaf swings, as unit steps along / across the wall */
  hinge?: Pt; swing?: Pt
  /** doors: the two ends of the swing arc — one is the open leaf's tip, the other the jamb it closes on */
  ends?: [Pt, Pt]
}
export interface Tag { c: Pt; r: number }

type Sub = { points: Pt[]; closed: boolean; curved: boolean }
const boxOf = (ps: Pt[]): Box => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of ps) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y } return [x1, y1, x2, y2] }

export function openings(L: PdfLayers, roles: Record<string, Role> = layerRoles(L)): { openings: Opening[]; tags: Tag[] } {
  const subs: Sub[] = L.paths.filter(p => roles[p.layer] === 'door').flatMap(p => p.subs)
  const out: Opening[] = [], tags: Tag[] = []

  // 1. curves: tag bubbles (closed, round) and door swings (open quarter arcs)
  for (const s of subs) {
    if (!s.curved) continue
    const b = boxOf(s.points), w = b[2] - b[0], h = b[3] - b[1], a = s.points[0], e = s.points[s.points.length - 1]
    const ends = Math.hypot(a[0] - e[0], a[1] - e[1])
    if (ends < .2 * Math.max(w, h)) { if (Math.abs(w - h) < .25 * Math.max(w, h)) tags.push({ c: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], r: Math.max(w, h) / 2 }); continue }
    if (Math.abs(w - h) > .3 * Math.max(w, h) || Math.max(w, h) < 12) continue      // not a quarter circle of door size
    // quarter arc from a to e: the hinge is the bbox corner equidistant (≈ r) from both ends
    const r = Math.max(w, h)
    // both free bbox corners are r away from the two ends; the hinge is the one the arc bulges away from
    const corners: Pt[] = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], mid = s.points[Math.floor(s.points.length / 2)]
    const hinge = corners.map(c => ({ c, err: Math.abs(Math.hypot(c[0] - a[0], c[1] - a[1]) - r) + Math.abs(Math.hypot(c[0] - e[0], c[1] - e[1]) - r) + Math.abs(Math.hypot(c[0] - mid[0], c[1] - mid[1]) - r) })).sort((p, q) => p.err - q.err)[0].c
    // the closed leaf lies along the wall: the arc end that a straight DOOR-layer line does NOT reach is the jamb
    const leafAt = (p: Pt) => subs.some(t => !t.curved && t.points.length <= 5 && near(t.points, hinge) && near(t.points, p))
    const open = leafAt(a) ? a : leafAt(e) ? e : a, shut = open === a ? e : a
    const axis: 'h' | 'v' = Math.abs(shut[0] - hinge[0]) > Math.abs(shut[1] - hinge[1]) ? 'h' : 'v'
    const from = axis === 'h' ? Math.min(hinge[0], shut[0]) : Math.min(hinge[1], shut[1]), to = axis === 'h' ? Math.max(hinge[0], shut[0]) : Math.max(hinge[1], shut[1])
    out.push({ kind: 'door', box: b, axis, from, to, at: axis === 'h' ? hinge[1] : hinge[0], hinge, swing: [Math.sign(open[0] - hinge[0]), Math.sign(open[1] - hinge[1])], ends: [shut, open] })
  }

  // 2. bands of parallel straight lines → glazing
  type Seg = { axis: 'h' | 'v'; at: number; from: number; to: number }
  const segs: Seg[] = []
  for (const s of subs) {
    if (s.curved) continue
    for (let i = 0; i + 1 < s.points.length + (s.closed ? 1 : 0); i++) {
      const a = s.points[i], b = s.points[(i + 1) % s.points.length]
      const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1])
      if (dy < .3 && dx > 10) segs.push({ axis: 'h', at: (a[1] + b[1]) / 2, from: Math.min(a[0], b[0]), to: Math.max(a[0], b[0]) })
      else if (dx < .3 && dy > 10) segs.push({ axis: 'v', at: (a[0] + b[0]) / 2, from: Math.min(a[1], b[1]), to: Math.max(a[1], b[1]) })
    }
  }
  const used = new Array(segs.length).fill(false)
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    const band = [i]; used[i] = true
    // grow: same direction, within 9 pt across (a wall's thickness), overlapping at least half along
    for (let grew = true; grew;) {
      grew = false
      for (let j = 0; j < segs.length; j++) {
        if (used[j] || segs[j].axis !== segs[i].axis) continue
        if (band.some(k => Math.abs(segs[k].at - segs[j].at) < 9 && Math.min(segs[k].to, segs[j].to) - Math.max(segs[k].from, segs[j].from) > .5 * Math.min(segs[k].to - segs[k].from, segs[j].to - segs[j].from))) { band.push(j); used[j] = true; grew = true }
      }
    }
    if (band.length < 2) continue
    const ss = band.map(k => segs[k]), axis = ss[0].axis
    const from = Math.min(...ss.map(s => s.from)), to = Math.max(...ss.map(s => s.to)), lo = Math.min(...ss.map(s => s.at)), hi = Math.max(...ss.map(s => s.at))
    if (hi - lo < .8) continue
    // a door leaf drawn as a thin rectangle next to a swing is not glazing
    if (out.some(o => o.kind === 'door' && o.box[0] - 2 <= (axis === 'h' ? from : lo) && o.box[2] + 2 >= (axis === 'h' ? to : hi) && o.box[1] - 2 <= (axis === 'h' ? lo : from) && o.box[3] + 2 >= (axis === 'h' ? hi : to))) continue
    out.push({ kind: 'glazing', box: axis === 'h' ? [from, lo, to, hi] : [lo, from, hi, to], axis, from, to, at: (lo + hi) / 2 })
  }
  return { openings: out, tags }
}

const near = (pts: Pt[], p: Pt, tol = 2.5) => pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol)
