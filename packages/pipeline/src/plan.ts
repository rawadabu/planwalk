import type { PdfPage, Pt, Shape } from './pdf'

/**
 * From vector shapes to a building: wall colour, drawings (one per storey), units of a twin house, storey alignment.
 * Everything here works in page points; conversion to house px happens in house.ts.
 */
export type Poly = Pt[]
export interface Drawing { walls: Poly[]; box: Box }
export type Box = [number, number, number, number]

export const area = (p: Poly) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2) }
export const bbox = (ps: Poly[]): Box => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of ps) for (const [x, y] of p) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y } return [x1, y1, x2, y2] }
const boxGap = (a: Box, b: Box) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]), Math.max(a[1], b[1]) - Math.min(a[3], b[3]))

/** The wall fill: the saturated colour covering the most area (black, white and greys are hatches, text and paper). */
export function wallColour(shapes: Shape[]): string | null {
  const total = new Map<string, number>()
  for (const s of shapes) {
    const c = s.fill, r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
    if (Math.max(r, g, b) - Math.min(r, g, b) < 60) continue
    total.set(c, (total.get(c) ?? 0) + area(s.points))
  }
  return [...total].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Wall polygons grouped into drawings (storeys). Header rules (long thin bars standing apart from everything)
 * are dropped. `gap` = how far apart two pieces of the same drawing may be, in points.
 */
export function drawings(page: PdfPage, colour: string, gap = 75): Drawing[] {
  let polys = page.shapes.filter(s => s.fill === colour).map(s => s.points)
  const boxes = () => polys.map(p => bbox([p]))
  // header rules: thin, very long, and nothing else within 25 pt
  {
    const B = boxes()
    polys = polys.filter((p, i) => {
      const [x1, y1, x2, y2] = B[i], w = x2 - x1, h = y2 - y1
      const thin = Math.min(w, h) < 12 && Math.max(w, h) > 250 && Math.max(w, h) > 15 * Math.min(w, h)
      return !(thin && B.every((o, k) => k === i || boxGap(o, B[i]) > 25))
    })
  }
  // union-find on box proximity
  const B = boxes(), parent = polys.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < B.length; i++) for (let k = i + 1; k < B.length; k++) if (boxGap(B[i], B[k]) <= gap) parent[find(i)] = find(k)
  const groups = new Map<number, Poly[]>()
  polys.forEach((p, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), p]) })
  return [...groups.values()].filter(g => g.length >= 3).map(walls => ({ walls, box: bbox(walls) })).sort((a, b) => a.box[0] - b.box[0])
}

/** Mirror axis of a twin house (vertical), if the walls are symmetric enough; null otherwise. */
export function mirrorAxis(d: Drawing, tol = 3): { x: number; score: number } | null {
  const verts = d.walls.flat()
  const grid = new Map<string, number>()
  const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`
  for (const [x, y] of verts) grid.set(key(x, y), 1)
  const has = (x: number, y: number) => { const gx = Math.round(x / tol), gy = Math.round(y / tol); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (grid.has(`${gx + i},${gy + j}`)) return true; return false }
  const c = (d.box[0] + d.box[2]) / 2
  let best = { x: c, score: 0 }
  for (let ax = c - 40; ax <= c + 40; ax += .5) {
    let hit = 0; for (const [x, y] of verts) if (has(2 * ax - x, y)) hit++
    const score = hit / verts.length
    if (score > best.score) best = { x: ax, score }
  }
  return best.score > .7 ? best : null
}

/** Keep the half-plane x ≤ at (side 'left') or x ≥ at ('right'): Sutherland–Hodgman against one vertical line. */
export function clipX(p: Poly, at: number, side: 'left' | 'right'): Poly {
  const inside = (q: Pt) => (side === 'left' ? q[0] <= at : q[0] >= at)
  const out: Poly = []
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], ia = inside(a), ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) { const t = (at - a[0]) / (b[0] - a[0]); out.push([at, a[1] + t * (b[1] - a[1])]) }
  }
  return out.length >= 3 && area(out) > .5 ? out : []
}

/** One unit of a twin house: the walls on one side of the mirror axis, the party wall cut down its middle. */
export function unitOf(d: Drawing, axis: number, side: 'left' | 'right'): Drawing {
  const walls = d.walls.map(p => clipX(p, axis, side)).filter(p => p.length)
  return { walls, box: bbox(walls) }
}

/** x' = sx·x + dx, y' = 3·y + dy: page points → house px for one storey (sx = ±PX_PER_PT; negative = drawn mirrored). */
export interface Place { sx: number; dx: number; dy: number }
export const PX_PER_PT = 3                                   // house@1 px are a 216 dpi render: 216 / 72
export const placePt = (pl: Place, [x, y]: Pt): Pt => [pl.sx * x + pl.dx, PX_PER_PT * y + pl.dy]
export const placePoly = (pl: Place, p: Poly): Poly => { const q = p.map(v => placePt(pl, v)); return pl.sx < 0 ? q.reverse() : q }

/**
 * How unit `b` sits under/over the reference unit `a` (already placed by `pa`): try b as drawn and mirrored, and vote for
 * the shift that makes the most wall corners coincide. Returns the placement and the share of b's corners that matched.
 */
export function alignTo(a: Drawing, pa: Place, b: Drawing, tol = 4): Place & { match: number } {
  const ref = a.walls.flat().map(v => placePt(pa, v)), verts = b.walls.flat()
  let best = { sx: PX_PER_PT, dx: 0, dy: 0, match: -1 }
  for (const sx of [PX_PER_PT, -PX_PER_PT]) {
    const votes = new Map<string, number>()
    for (const [x, y] of verts) { const bx = sx * x, by = PX_PER_PT * y; for (const [rx, ry] of ref) { const k = `${Math.round((rx - bx) / tol)},${Math.round((ry - by) / tol)}`; votes.set(k, (votes.get(k) ?? 0) + 1) } }
    for (const [k, n] of votes) {
      if (n / verts.length <= best.match) continue
      // refine: mean residual of the matching pairs around the voted shift
      const [kx, ky] = k.split(',').map(Number); let sdx = 0, sdy = 0, m = 0
      for (const [x, y] of verts) for (const [rx, ry] of ref) { const ex = rx - sx * x - kx * tol, ey = ry - PX_PER_PT * y - ky * tol; if (Math.abs(ex) <= tol && Math.abs(ey) <= tol) { sdx += ex; sdy += ey; m++ } }
      best = { sx, dx: kx * tol + (m ? sdx / m : 0), dy: ky * tol + (m ? sdy / m : 0), match: n / verts.length }
    }
  }
  return best
}
