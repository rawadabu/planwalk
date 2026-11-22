import type { House, Floor, Item, StoreyId } from '@planwalk/house'
import type { PdfPage, Pt } from './pdf'
import { wallColour, drawings, mirrorAxis, unitOf, alignTo, placePoly, PX_PER_PT, bbox, type Drawing, type Place, type Poly } from './plan'
import { Grid, edt, close, components, fillHoles } from './raster'

/**
 * PDF page → house@1. Storeys are the separate wall drawings on the sheet; for a twin house one unit is taken.
 * Everything uncertain (room names, which drawing is which storey, door vs window) is a guess the review step corrects.
 */
export interface Options {
  /** drawings left→right on the sheet are storeys…  'rtl': rightmost is the ground floor (Hebrew sheets), 'ltr': leftmost */
  order?: 'rtl' | 'ltr'
  /** for a twin house, which unit of the top storey is the reference ('left' | 'right'); the others are aligned to it */
  unit?: 'left' | 'right'
  id?: string
  title?: string
  file?: string
}

const CELL = 2                     // px per raster cell (≈ 2 cm)
const PX_PER_M = 437 / 4.40       // calibration of the twin-a sheet (a written 440 measures 437 px); a dimension picked in review overrides it
const OPEN_R = 110                 // px: after the hull, gaps up to 2 × this wide are bridged
const EXTEND = 260                 // px: longest implied wall
const SEED_R = 46                  // px: free space this far from any wall seeds a room (doors ≈ 80–90 cm don't)
const MIN_SEED = 0.4               // m² of seed area for a room to count

export interface StoreyReport { storey: StoreyId; drawing: number; place: Place; match: number; walls: number; rooms: number; glass: number }
export interface Built { house: House; maps: Record<string, string>; report: { colour: string; drawings: number; axis: Array<number | null>; storeys: StoreyReport[]; warnings: string[] } }

export function build(page: PdfPage, opts: Options = {}): Built {
  const warnings: string[] = []
  const colour = wallColour(page.shapes)
  if (!colour) throw new Error('no coloured wall fill found on the page')
  const ds = drawings(page, colour)
  if (ds.length < 1) throw new Error('no wall drawings found')
  if (ds.length !== 3) warnings.push(`found ${ds.length} storey drawings; house@1 expects 3`)
  // storeys: index in left→right order → storey id
  const order = opts.order ?? 'rtl'
  const byStorey = (order === 'rtl' ? [...ds].reverse() : ds).slice(0, 3)
  const axes = byStorey.map(d => mirrorAxis(d))
  const units: Drawing[] = byStorey.map((d, i) => (axes[i] ? unitOf(d, axes[i]!.x, opts.unit ?? 'left') : d))
  // the other side of each twin storey too, so alignment can pick whichever matches the reference best
  const other: Array<Drawing | null> = byStorey.map((d, i) => (axes[i] ? unitOf(d, axes[i]!.x, (opts.unit ?? 'left') === 'left' ? 'right' : 'left') : null))

  const top = byStorey.length - 1
  const minY = Math.min(...byStorey.map(d => d.box[1]))
  const ref = units[top]
  const pRef: Place = { sx: PX_PER_PT, dx: -PX_PER_PT * (ref.box[0] - 30), dy: -PX_PER_PT * (minY - 30) }
  const placed: Array<{ unit: Drawing; place: Place; match: number }> = []
  // each storey is aligned to the one above it (neighbouring storeys share the most walls)
  for (let s = top; s >= 0; s--) {
    if (s === top) { placed[s] = { unit: ref, place: pRef, match: 1 }; continue }
    const above = placed[s + 1]
    const cands = [units[s], other[s]].filter(Boolean) as Drawing[]
    const fits = cands.map(u => ({ unit: u, ...alignTo(above.unit, above.place, u) }))
    const best = fits.sort((a, b) => b.match - a.match)[0]
    placed[s] = { unit: best.unit, place: { sx: best.sx, dx: best.dx, dy: best.dy }, match: best.match }
    if (best.match < .25) warnings.push(`storey ${s} lines up poorly with storey ${s + 1} (${Math.round(best.match * 100)}% of corners)`)
  }

  const floors = {} as Record<StoreyId, Floor>, maps: Record<string, string> = {}, items: Item[] = [], storeys: StoreyReport[] = []
  const names = ['קומת קרקע', 'קומה ראשונה', 'קומה שנייה']
  const storeyWalls = placed.map(P => P.unit.walls.map(p => placePoly(P.place, p)).map(round))
  // the envelope: open storeys (glass facades) borrow the closed walls of the storeys above and below
  const envelope = storeyWalls.flat()
  for (let s = 0; s < 3; s++) {
    const f = s as StoreyId, P = placed[s]
    if (!P) { floors[f] = emptyFloor(names[s]); continue }
    const walls = storeyWalls[s]
    const r = analyse(walls, envelope)
    const [x1, y1, x2, y2] = bbox(walls)
    const bounds: [number, number, number, number] = [Math.round(x1 - 30), Math.round(y1 - 30), Math.round(x2 + 30), Math.round(y2 + 30)]
    const big = r.rooms.slice(0, r.indoor).sort((a, b) => area(b) - area(a))[0]
    const start = big ? { x: Math.round((big[2] + big[4]) / 2), y: Math.round((big[3] + big[5]) / 2), yaw: 0 } : { x: (x1 + x2) / 2, y: (y1 + y2) / 2, yaw: 0 }
    const map = `plan_f${s}.svg`
    floors[f] = { name: names[s], bounds, map, start, walls, glass: r.glass, rooms: r.rooms, indoor: r.indoor, rects: [] }
    maps[map] = svg(walls, r.rooms.slice(0, r.indoor), bounds)
    // floor and ceiling slabs over the building outline's bounding rects of indoor rooms
    for (const rm of r.rooms.slice(0, r.indoor)) items.push({ k: 'box', f, layer: 'arch', r: [rm[2], rm[3], rm[4], rm[5]], y: [-.02, 0], m: 'floor' })
    storeys.push({ storey: f, drawing: ds.indexOf(byStorey[s]), place: P.place, match: +P.match.toFixed(3), walls: walls.length, rooms: r.indoor, glass: r.glass.length })
  }

  const house: House = {
    format: 'house@1', id: opts.id ?? 'auto', title: opts.title ?? 'בית מתוכנית', source: { file: opts.file ?? 'plan.pdf', scale: '1:100', pxPerMetre: PX_PER_M, note: 'auto: pipeline A-09' },
    storey: { height: 2.8, slab: .25, assumed: true }, floors: floors as House['floors'], void: [], stairs: { step: .175, path: {}, exit: {}, trigger: {}, zone: {}, arrive: {} },
    canopies: [], items,
  }
  return { house, maps, report: { colour, drawings: ds.length, axis: axes.map(a => (a ? +a.x.toFixed(2) : null)), storeys, warnings } }
}

const round = (p: Poly): Poly => p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
const area = (r: [string, string, number, number, number, number]) => (r[4] - r[2]) * (r[5] - r[3])
const emptyFloor = (name: string): Floor => ({ name, bounds: [0, 0, 100, 100], map: '', start: { x: 50, y: 50, yaw: 0 }, walls: [], glass: [], rooms: [], indoor: 0, rects: [] })

/** Rooms and exterior openings of one storey from its wall polygons (house px). */
export function analyse(walls: Poly[], envelope: Poly[] = walls) {
  const g = Grid.around(envelope, CELL, OPEN_R + 60)
  for (const p of walls) g.fill(p)
  const env = g.like(); for (const p of envelope) env.fill(p)
  // building outline: cells with wall on all four sides along their row and column (rectilinear hull), then bridged
  // implied walls: a wall that stops short (door, open-plan opening) is carried on to the next wall, up to EXTEND px
  const bars = g.like(); for (const p of walls) for (const b of extensions(p, g)) bars.fill(b)
  for (let k = 0; k < g.a.length; k++) if (bars.a[k]) g.a[k] = 2
  const hull = rowColHull(env); for (let k = 0; k < g.a.length; k++) if (g.a[k]) hull.a[k] = 1
  const inside = fillHoles(close(hull, OPEN_R / CELL))
  const { w, h } = g
  // free space distance to walls or the outside
  const block = g.like(); for (let k = 0; k < w * h; k++) block.a[k] = g.a[k] || !inside.a[k] ? 1 : 0
  const d = edt(block), seedR2 = (SEED_R / CELL) ** 2
  const seeds = components(g, k => d[k] > seedR2)
  const minCells = MIN_SEED * (PX_PER_M / CELL) ** 2
  // grow seeds over free space (breadth-first = geodesic nearest seed)
  const lab = g.like(), q: number[] = []
  for (let k = 0; k < w * h; k++) { const id = seeds.lab.a[k]; if (id && seeds.sizes[id] >= minCells) { lab.a[k] = id; q.push(k) } }
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], i = k % w
    for (const m of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, k - w, k + w]) if (m >= 0 && m < w * h && !lab.a[m] && !block.a[m]) { lab.a[m] = lab.a[k]; q.push(m) }
  }
  // rooms = bounding rects of labels
  const box = new Map<number, [number, number, number, number, number]>()
  for (let k = 0; k < w * h; k++) { const id = lab.a[k]; if (!id) continue; const i = k % w, j = (k - i) / w; const b = box.get(id) ?? [i, j, i, j, 0]; b[0] = Math.min(b[0], i); b[1] = Math.min(b[1], j); b[2] = Math.max(b[2], i); b[3] = Math.max(b[3], j); b[4]++; box.set(id, b) }
  const rooms: Array<[string, string, number, number, number, number]> = []
  let n = 0
  for (const [, [i1, j1, i2, j2, cells]] of [...box].sort((a, b) => a[1][1] - b[1][1] || a[1][0] - b[1][0])) {
    const X1 = Math.round(g.ox + i1 * CELL), Y1 = Math.round(g.oy + j1 * CELL), X2 = Math.round(g.ox + (i2 + 1) * CELL), Y2 = Math.round(g.oy + (j2 + 1) * CELL)
    const W = (X2 - X1) / PX_PER_M, D = (Y2 - Y1) / PX_PER_M, A = cells * (CELL / PX_PER_M) ** 2
    const name = A < 2.6 ? 'שירותים' : Math.min(W, D) < 1.45 && Math.max(W, D) > 2.2 ? 'מעבר' : `חדר ${++n}`
    rooms.push([name, `${Math.round(W * 10) * 10} × ${Math.round(D * 10) * 10}`, X1, Y1, X2, Y2])
  }
  const indoor = rooms.length
  rooms.push(['חוץ', '', -999, -999, 9999, 9999])

  // exterior openings: outline cells (inside, touching outside) with no wall close by
  const real = g.like(); for (let k = 0; k < g.a.length; k++) real.a[k] = g.a[k] === 1 ? 1 : 0
  const gap = g.like(), wd = edt(real)
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i
    if (!inside.a[k] || wd[k] <= 2.25) continue
    if (!inside.a[k - 1] || !inside.a[k + 1] || !inside.a[k - w] || !inside.a[k + w]) gap.a[k] = 1
  }
  const runs = components(gap, k => gap.a[k] === 1)
  const glass: Array<[number, number, number, number, number, number]> = []
  const rb = new Map<number, [number, number, number, number]>()
  for (let k = 0; k < w * h; k++) { const id = runs.lab.a[k]; if (!id) continue; const i = k % w, j = (k - i) / w; const b = rb.get(id) ?? [i, j, i, j]; b[0] = Math.min(b[0], i); b[1] = Math.min(b[1], j); b[2] = Math.max(b[2], i); b[3] = Math.max(b[3], j); rb.set(id, b) }
  for (const [, [i1, j1, i2, j2]] of rb) {
    const horiz = i2 - i1 >= j2 - j1, len = (horiz ? i2 - i1 + 1 : j2 - j1 + 1) * CELL
    if (len < 40) continue
    // glass sits ~10 px (half a wall) in from the outline, 6 px thick
    const ci = Math.round((i1 + i2) / 2), cj = Math.round((j1 + j2) / 2)
    const inward = horiz ? (inside.get(ci, cj + 3) && !inside.get(ci, cj - 3) ? 1 : -1) : (inside.get(ci + 3, cj) && !inside.get(ci - 3, cj) ? 1 : -1)
    const sill = len >= 180 ? 0 : 1, head = len >= 180 ? 2.6 : 2.2
    if (horiz) { const y = g.oy + (cj + .5) * CELL + inward * 10; glass.push([Math.round(g.ox + i1 * CELL), Math.round(y - 3), Math.round(g.ox + (i2 + 1) * CELL), Math.round(y + 3), sill, head]) }
    else { const x = g.ox + (ci + .5) * CELL + inward * 10; glass.push([Math.round(x - 3), Math.round(g.oy + j1 * CELL), Math.round(x + 3), Math.round(g.oy + (j2 + 1) * CELL), sill, head]) }
  }
  return { rooms, indoor, glass, grid: { g, inside, lab, gap } }
}

/** Barriers continuing each wall tip (an edge no longer than a wall is thick) straight on until another wall. */
function extensions(p: Poly, g: Grid): Poly[] {
  const out: Poly[] = []
  let sa = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) sa += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1])
  const ccw = sa > 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    if (len < 6 || len > 32 || (Math.abs(dx) > .5 && Math.abs(dy) > .5)) continue
    // outward normal
    let nx = dy / len, ny = -dx / len; if (!ccw) { nx = -nx; ny = -ny }
    // the edges either side must run back along -n (a real tip, not a notch)
    const prev = p[(i - 1 + p.length) % p.length], next = p[(i + 2) % p.length]
    const back = (q: number[], o: number[]) => ((q[0] - o[0]) * nx + (q[1] - o[1]) * ny) < -len
    if (!back(prev, a) || !back(next, b)) continue
    // march until a wall cell is hit across the middle of the tip
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    let t = g.cell * 1.5, hit = -1
    for (; t <= EXTEND; t += g.cell) { const i2 = Math.floor((mx + nx * t - g.ox) / g.cell), j2 = Math.floor((my + ny * t - g.oy) / g.cell); if (g.get(i2, j2) === 1) { hit = t; break } }
    if (hit < 0) continue
    out.push([a, b, [b[0] + nx * hit, b[1] + ny * hit], [a[0] + nx * hit, a[1] + ny * hit]])
  }
  return out
}

/** Cells lying between walls both along their row and along their column (plus the walls). */
export function rowColHull(g: Grid): Grid {
  const { w, h } = g, out = g.like(), L = new Int32Array(h).fill(-1), R = new Int32Array(h).fill(-1), T = new Int32Array(w).fill(-1), B = new Int32Array(w).fill(-1)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (g.a[j * w + i]) { if (L[j] < 0) L[j] = i; R[j] = i; if (T[i] < 0) T[i] = j; B[i] = j }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.a[j * w + i] = g.a[j * w + i] || (L[j] >= 0 && i > L[j] && i < R[j] && T[i] >= 0 && j > T[i] && j < B[i]) ? 1 : 0
  return out
}

/** A minimap image: walls in ink, rooms tinted, in the floor's own px frame. */
export function svg(walls: Poly[], rooms: Array<[string, string, number, number, number, number]>, [x1, y1, x2, y2]: number[]) {
  const path = walls.map(p => 'M' + p.map(([x, y]) => `${x} ${y}`).join('L') + 'Z').join('')
  const rs = rooms.map(r => `<rect x="${r[2]}" y="${r[3]}" width="${r[4] - r[2]}" height="${r[5] - r[3]}" fill="#eef1f4" stroke="#d7dde3" stroke-width="2"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x1} ${y1} ${x2 - x1} ${y2 - y1}" width="${x2 - x1}" height="${y2 - y1}"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="#fff"/>${rs}<path d="${path}" fill="#1f2933"/></svg>`
}

export type { Pt }
