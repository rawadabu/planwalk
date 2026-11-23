import type { Item } from '@planwalk/house'
import type { PdfLayers, Pt } from './pdf'
import { allLabels, layerRoles, type Box, type Label } from './labels'
import { openings as readOpenings, type Opening } from './openings'
import { calibrate } from './scale'
import { asCm, type Read } from './read'
import { drawings, mirrorAxis, unitOf, alignTo, placePoly, placePt, bbox, type Drawing, type Place, type Poly } from './plan'
import { Grid, components } from './raster'
import { findStairs, findRailings, type Stroke, type Stair } from './stairs'

/**
 * plan@1 — what the pipeline understood from a sheet, before anything is built: storeys, walls, openings, rooms with
 * their written names, the calibrated scale, and a note on everything it was unsure of. The review screen edits this
 * document; house@1 is derived from it (tohouse.ts). All geometry is in house px (≈ cm) per storey.
 */
export const PX_PER_M = 437 / 4.40          // the engine's unit: every plan is normalised to it
const CELL = 2                              // px per raster cell
const EXTEND = 260                          // px: longest implied wall (a wall carried on to the next one)
const IMPLIED_COST = 90                     // crossing an implied wall costs as much as walking this many cells
const DRAWN_COST = 30                       // crossing a long drawn line (railing, step, counter edge) — a weaker hint
const TILE = 10                             // px lattice of the floor tiles

export interface PlanRoom {
  name: string
  rect: Box
  area: number                              // m²
  outdoor: boolean
  /** 'label': a written name inside closed walls · 'split': an open space divided between two names · 'guess': no name written */
  from: 'label' | 'split' | 'guess'
  at?: Pt                                   // where the name is written
  /** the room's floor as rectangles (exact shape; `rect` is only its bounding box) */
  tiles: Box[]
  /** an upper-storey opening over the room below (double height): no floor here */
  void?: boolean
}
export interface PlanOpening { kind: 'door' | 'window' | 'glass-door'; rect: Box; axis: 'h' | 'v'; sill: number; head: number; hinge?: Pt; swing?: Pt; sure: boolean }
type NoF<T> = T extends unknown ? Omit<T, 'f'> : never
export interface PlanNote { text: string; at: Pt; box: Box; kind: 'fixture' | 'room' | 'note' }
export interface PlanStorey { storey: number; name: string; title: string | null; drawing: number; side: 'left' | 'right' | 'whole'; place: Place; match: number; /** x of the party wall when this is one unit of a twin house */ party: number | null; bounds: Box; walls: Poly[]; openings: PlanOpening[]; rooms: PlanRoom[]; notes: PlanNote[]; stairs: Stair[]; railings: Box[]; strokes: Stroke[]; /** furniture already known piece by piece (a CAD drawing's blocks); when present the builder does not look for furniture by shape */ things?: Array<NoF<Item>> }
export interface Plan {
  format: 'plan@1'
  scale: { ptPerCm: number; pxPerPt: number; from: 'dimensions' | 'assumed' | 'drawing'; dimensions: number; agree: number; written: number | null }
  /** heights the plans state (metres): clear ceiling and floor-to-floor. Absent = not stated, the builder assumes them. */
  heights?: { ceiling: number; storey: number }
  storeys: PlanStorey[]
  warnings: string[]
}
export interface Options { unit?: 'left' | 'right'; order?: 'rtl' | 'ltr' }

const STOREY_NAMES: Record<number, string> = { [-1]: 'מרתף', 0: 'קומת קרקע', 1: 'קומה ראשונה', 2: 'קומה שנייה', 3: 'קומה שלישית' }
const OUTDOOR = /מרפסת|גינה|חצר|חניה|חנייה|פרגולה|גג|דק|בריכה/
const WET = /מקלחת|שירותים|אמבט|רחצה/
const ENTRANCE = /מבוא|כניסה|לובי/
const COUNTER = /כיור|מגירות|כיריים|מדיח|תנור|משטח/

const dist = (a: Box, b: Box) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]), Math.max(a[1], b[1]) - Math.min(a[3], b[3]))
const centre = (b: Box): Pt => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
const placeBox = (pl: Place, b: Box): Box => { const [x1, y1] = placePt(pl, [b[0], b[1]]), [x2, y2] = placePt(pl, [b[2], b[3]]); return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)] }
const round = (p: Poly): Poly => p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])

export function understand(L: PdfLayers, read: Map<number, Read>, opts: Options = {}): Plan {
  const warnings: string[] = []
  const roles = layerRoles(L)
  const A = allLabels(L, roles)
  for (const l of [...A.text, ...A.dims]) { const r = read.get(l.id); if (r?.text) l.text = r.text }

  // 1. scale from the written dimensions
  const sc = calibrate(A.lines, A.ticks, A.dims, l => asCm(l.text))
  const titles = A.text.map(l => ({ l, r: read.get(l.id) })).filter(t => t.r?.kind === 'title')
  const written = titles.map(t => t.r!.scale).find(v => v) ?? null
  const ptPerCm = sc?.ptPerCm ?? 72 / 2.54 / (written ?? 100)
  if (!sc) warnings.push('no dimensions could be measured; the scale is taken from the title')
  else if (sc.agree < .7 * sc.used) warnings.push(`only ${sc.agree} of ${sc.used} dimensions agree on the scale`)
  if (sc && written && Math.abs(72 / 2.54 / written / ptPerCm - 1) > .03) warnings.push(`the sheet says 1:${written} but its dimensions measure 1:${Math.round(72 / 2.54 / ptPerCm)} (not plotted to scale); dimensions win`)
  const K = (PX_PER_M / 100) / ptPerCm                                  // px per point

  // 2. storeys: one wall drawing each, named by the title written over it
  const wallPaths = L.paths.filter(p => roles[p.layer] === 'wall' && p.paint !== 'stroke')
  const O = readOpenings(L, roles)
  const ds = drawings({ width: L.width, height: L.height, shapes: wallPaths.flatMap(p => p.subs.map(s => ({ fill: 'wall', points: s.points }))) }, 'wall', 75, O.openings.map(o => o.box))
  if (!ds.length) throw new Error('no wall drawings found')
  const storeyOf = new Map<number, { storey: number; title: string }>()
  for (const t of titles) {
    if (t.r!.storey === null) continue
    const c = centre(t.l.box)
    const i = ds.map((d, i) => ({ i, d: Math.max(0, d.box[0] - c[0], c[0] - d.box[2]) + Math.max(0, d.box[1] - c[1]) * .2 })).sort((a, b) => a.d - b.d)[0].i
    if (!storeyOf.has(i)) storeyOf.set(i, { storey: t.r!.storey, title: t.r!.text })
  }
  if (storeyOf.size < ds.length) {
    warnings.push('not every drawing has a readable title; storeys are ordered by position on the sheet')
    const order = (opts.order ?? 'rtl') === 'rtl' ? [...ds.keys()].reverse() : [...ds.keys()]
    order.forEach((i, s) => { if (!storeyOf.has(i)) storeyOf.set(i, { storey: s, title: '' }) })
  }
  const order = [...storeyOf].sort((a, b) => a[1].storey - b[1].storey)            // [drawing index, {storey}] ascending

  // 3. twin house: one unit per storey, aligned storey to storey (top one is the reference)
  const want = opts.unit ?? 'left'
  type Pick = { unit: Drawing; side: 'left' | 'right' | 'whole'; axis: number | null; place: Place; match: number }
  const picks = new Map<number, Pick>()
  const minY = Math.min(...ds.map(d => d.box[1]))
  for (let k = order.length - 1; k >= 0; k--) {
    const di = order[k][0], d = ds[di], ax = mirrorAxis(d)
    const cands: Array<{ unit: Drawing; side: 'left' | 'right' | 'whole' }> = ax ? [{ unit: unitOf(d, ax.x, want), side: want }, { unit: unitOf(d, ax.x, want === 'left' ? 'right' : 'left'), side: want === 'left' ? 'right' : 'left' }] : [{ unit: d, side: 'whole' }]
    if (k === order.length - 1) { const u = cands[0]; picks.set(di, { ...u, axis: ax?.x ?? null, place: { sx: K, dx: -K * (u.unit.box[0] - 10), dy: -K * (minY - 10) }, match: 1 }); continue }
    const above = picks.get(order[k + 1][0])!
    const best = cands.map(c => ({ ...c, fit: alignTo(above.unit, above.place, c.unit) })).sort((a, b) => b.fit.match - a.fit.match)[0]
    picks.set(di, { unit: best.unit, side: best.side, axis: ax?.x ?? null, place: { sx: best.fit.sx, dx: best.fit.dx, dy: best.fit.dy }, match: best.fit.match })
    if (best.fit.match < .2) warnings.push(`storey ${order[k][1].storey} lines up poorly with the storey above (${Math.round(best.fit.match * 100)}% of corners)`)
  }

  // 4. everything drawn belongs to the nearest drawing, and to the chosen unit's side of the party wall
  const mine = (b: Box, di: number) => {
    const near = ds.map((d, i) => ({ i, d: dist(b, d.box) })).sort((a, c) => a.d - c.d)[0]
    if (near.i !== di || near.d > 170) return false
    const p = picks.get(di)!, cx = (b[0] + b[2]) / 2
    return p.axis === null || (p.side === 'left' ? cx <= p.axis + 1 : cx >= p.axis - 1)
  }

  const storeys: PlanStorey[] = []
  for (const [di, { storey, title }] of order) {
    const P = picks.get(di)!, pl = P.place
    const walls = P.unit.walls.map(p => round(placePoly(pl, p)))
    const ops = O.openings.filter(o => mine(o.box, di))
    const labels = A.text.filter(l => l.text && mine(l.box, di) && read.get(l.id)?.kind !== 'title')
    // everything else drawn on this storey (furniture, stairs, railings, fixtures), in house px
    const strokes: Stroke[] = []
    for (const p of L.paths) {
      if (roles[p.layer] !== 'other' && roles[p.layer] !== 'furniture') continue
      for (const sub of p.subs) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
        for (const [x, y] of sub.points) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y }
        if (!mine([x1, y1, x2, y2], di)) continue
        const pts = sub.points.map(q => placePt(pl, q))
        strokes.push({ pts, width: p.width, dashed: p.dashed, curved: sub.curved, closed: sub.closed, layer: p.layer })
      }
    }
    const r = analyse(walls, ops.map(o => place(o, pl)), strokes, labels.map(l => ({ text: l.text!, kind: read.get(l.id)!.kind, box: placeBox(pl, l.box), size: Math.min(l.box[2] - l.box[0], l.box[3] - l.box[1]) * Math.abs(pl.sx) })))
    const [x1, y1, x2, y2] = bbox(walls)
    storeys.push({ storey, name: STOREY_NAMES[storey] ?? `קומה ${storey}`, title: title || null, drawing: di, side: P.side, place: pl, match: +P.match.toFixed(3), party: P.axis === null ? null : Math.round(placePt(pl, [P.axis, 0])[0]), bounds: [Math.round(x1 - 30), Math.round(y1 - 30), Math.round(x2 + 30), Math.round(y2 + 30)], walls, rooms: r.rooms, openings: r.openings, notes: r.notes, stairs: r.stairs, railings: r.railings, strokes })
  }
  // a living room named again on the storey above it is the opening over it (double height), not a second living room
  for (const up of storeys) {
    const below = storeys.find(b => b.storey === up.storey - 1); if (!below) continue
    for (const r of up.rooms) {
      if (r.outdoor || !/סלון|חלל|מבואה|כניסה/.test(r.name)) continue
      const twin = below.rooms.find(b => b.name === r.name && !b.outdoor); if (!twin) continue
      const ix = Math.min(r.rect[2], twin.rect[2]) - Math.max(r.rect[0], twin.rect[0]), iy = Math.min(r.rect[3], twin.rect[3]) - Math.max(r.rect[1], twin.rect[1])
      if (ix > 0 && iy > 0 && ix * iy > .6 * (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1])) { r.void = true; r.name = `חלל כפול (${r.name})` }
    }
  }
  return { format: 'plan@1', scale: { ptPerCm, pxPerPt: K, from: sc ? 'dimensions' : 'assumed', dimensions: sc?.used ?? 0, agree: sc?.agree ?? 0, written }, storeys, warnings }
}

type PxOpening = Opening & { hingePx?: Pt }
function place(o: Opening, pl: Place): PxOpening {
  const box = placeBox(pl, o.box), k = Math.abs(pl.sx), mx = pl.sx < 0
  const along = (v: number) => (o.axis === 'h' ? pl.sx * v + pl.dx : k * v + pl.dy), across = (v: number) => (o.axis === 'h' ? k * v + pl.dy : pl.sx * v + pl.dx)
  const a = along(o.from), b = along(o.to)
  return { ...o, box, from: Math.min(a, b), to: Math.max(a, b), at: across(o.at), hinge: o.hinge && placePt(pl, o.hinge), swing: o.swing && [mx ? -o.swing[0] : o.swing[0], o.swing[1]], ends: o.ends && [placePt(pl, o.ends[0]), placePt(pl, o.ends[1])] }
}

interface PxLabel { text: string; kind: Read['kind']; box: Box; size: number }

/** Rooms and classified openings of one storey (house px). */
export function analyse(walls: Poly[], ops: PxOpening[], strokes: Stroke[], labels: PxLabel[]) {
  const g = Grid.around([...walls, ...ops.map(o => [[o.box[0], o.box[1]], [o.box[2], o.box[3]]] as Poly), ...labels.map(l => [[l.box[0], l.box[1]], [l.box[2], l.box[3]]] as Poly)], CELL, 120)
  const { w, h } = g
  // real boundaries: walls 1, glazing 3, doors 4
  for (const p of walls) g.fill(p, 1)
  const rectFill = (b: Box, v: number) => g.fill([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], v)
  const bands: Box[] = []
  const wallAt = (x: number, y: number) => g.get(Math.floor((x - g.ox) / CELL), Math.floor((y - g.oy) / CELL)) === 1
  for (const o of ops) if (o.kind === 'door' && o.hinge && o.ends) {
    // which arc end is the jamb? the doorway runs wall-to-wall: wall carries on behind the hinge and past the jamb, and nothing is in between
    const score = (p: Pt) => {
      const dx = p[0] - o.hinge![0], dy = p[1] - o.hinge![1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len
      let s = 0
      for (const t of [8, 14]) { if (wallAt(p[0] + ux * t, p[1] + uy * t)) s++; if (wallAt(o.hinge![0] - ux * t, o.hinge![1] - uy * t)) s++ }
      for (let t = .25; t < .8; t += .1) if (wallAt(o.hinge![0] + dx * t, o.hinge![1] + dy * t)) s -= 2
      return s
    }
    const [s0, s1] = [score(o.ends[0]), score(o.ends[1])]
    const shut = s1 > s0 ? o.ends[1] : o.ends[0], open = shut === o.ends[0] ? o.ends[1] : o.ends[0]
    o.axis = Math.abs(shut[0] - o.hinge[0]) > Math.abs(shut[1] - o.hinge[1]) ? 'h' : 'v'
    o.from = o.axis === 'h' ? Math.min(o.hinge[0], shut[0]) : Math.min(o.hinge[1], shut[1]); o.to = o.axis === 'h' ? Math.max(o.hinge[0], shut[0]) : Math.max(o.hinge[1], shut[1])
    o.at = o.axis === 'h' ? o.hinge[1] : o.hinge[0]
    o.swing = [Math.sign(Math.round(open[0] - o.hinge[0])), Math.sign(Math.round(open[1] - o.hinge[1]))]
  }
  const skip = new Set<PxOpening>()
  for (const o of ops) {
    // across the wall: at least a wall's thickness, so the band seals the gap between the two wall ends
    const half = o.kind === 'door' ? 6 : Math.max(8, (o.axis === 'h' ? o.box[3] - o.box[1] : o.box[2] - o.box[0]) / 2)
    const b: Box = o.axis === 'h' ? [o.from - 6, o.at - half, o.to + 6, o.at + half] : [o.at - half, o.from - 6, o.at + half, o.to + 6]
    bands.push(b)
    // lines drawn along the face of a solid wall (a shelter's sliding blast shutter, a pocket) are not an opening in it
    if (o.kind !== 'door') {
      let solid = 0, all = 0
      for (let t = .1; t < .95; t += .1) { const x = o.axis === 'h' ? o.from + (o.to - o.from) * t : o.at, y = o.axis === 'h' ? o.at : o.from + (o.to - o.from) * t; all++; if (wallAt(x, y)) solid++ }
      if (solid >= .7 * all) { skip.add(o); continue }
      // an opening sits between two wall ends (or meets other glazing at a corner); lines floating beside a wall do not
      const endOk = (v: number) => [-half * .6, 0, half * .6].some(d => [4, 10, 16].some(t => { const a = v + Math.sign(v - (o.from + o.to) / 2) * t; return o.axis === 'h' ? wallAt(a, o.at + d) : wallAt(o.at + d, a) }))
        || ops.some(q => q !== o && Math.max(0, Math.max(q.box[0], o.box[0]) - Math.min(q.box[2], o.box[2]), Math.max(q.box[1], o.box[1]) - Math.min(q.box[3], o.box[3])) < 14)
      if (!endOk(o.from) && !endOk(o.to)) { skip.add(o); continue }
      // a recess in one face of a wall (the pocket a shutter slides into): solid wall right behind it
      const m = (o.from + o.to) / 2, behind = [-1, 1].some(sg => [half + 8, half + 14].every(t => (o.axis === 'h' ? wallAt(m, o.at + sg * t) : wallAt(o.at + sg * t, m))))
      if (behind) { skip.add(o); continue }
    }
    const before = g.like(); before.a.set(g.a)
    rectFill(b, o.kind === 'door' ? 4 : 3)
    for (let k = 0; k < w * h; k++) if (before.a[k] === 1) g.a[k] = 1          // never paint over a wall
  }
  // stairs 6 and railings 5 are boundaries too: you don't walk through a railing, and a stair is neither room
  const stairs = findStairs(strokes), railings = findRailings(strokes)
  const paint = (b: Box, v: number, grow = 0) => { const before = g.like(); before.a.set(g.a); rectFill([b[0] - grow, b[1] - grow, b[2] + grow, b[3] + grow], v); for (let k = 0; k < w * h; k++) if (before.a[k]) g.a[k] = before.a[k] }
  for (const st of stairs) paint(st.box, 6)
  for (const r of railings) paint(r, 5, 2)
  // implied walls 2: a wall tip carried straight on to the next boundary
  const imp = g.like()
  for (const p of walls) for (const b of extensions(p, g)) imp.fill(b)
  for (let k = 0; k < w * h; k++) if (imp.a[k] && !g.a[k]) g.a[k] = 2

  // long drawn lines: soft hints for where an open space divides
  const soft = new Uint8Array(w * h)
  for (const st of strokes) {
    if (st.curved) continue
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const a = st.pts[i], b = st.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 75) continue
      const n = Math.ceil(len / (CELL * .7))
      for (let t = 0; t <= n; t++) { const k = (Math.floor((a[1] + (b[1] - a[1]) * t / n - g.oy) / CELL)) * w + Math.floor((a[0] + (b[0] - a[0]) * t / n - g.ox) / CELL); if (k >= 0 && k < w * h) soft[k] = 1 }
    }
  }

  // outside: free space reachable from the border without crossing anything (not even an implied wall)
  const fine = components(g, k => g.a[k] === 0)
  const outsideIds = new Set<number>()
  for (let i = 0; i < w; i++) { outsideIds.add(fine.lab.a[i]); outsideIds.add(fine.lab.a[(h - 1) * w + i]) }
  for (let j = 0; j < h; j++) { outsideIds.add(fine.lab.a[j * w]); outsideIds.add(fine.lab.a[j * w + w - 1]) }
  outsideIds.delete(0)
  const outside = (k: number) => outsideIds.has(fine.lab.a[k])
  // closed regions: bounded by real things only (implied walls don't close a room, they only suggest where to divide one)
  const closed = components(g, k => (g.a[k] === 0 || g.a[k] === 2) && !outside(k))

  const cellOf = (p: Pt) => { const i = Math.floor((p[0] - g.ox) / CELL), j = Math.floor((p[1] - g.oy) / CELL); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i }
  const roomLabels = labels.filter(l => l.kind === 'room').map(l => ({ ...l, c: centre(l.box), cell: -1, region: 0 }))
  for (const l of roomLabels) {
    l.cell = cellOf(l.c)
    if (l.cell >= 0 && g.a[l.cell] !== 0 && g.a[l.cell] !== 2) l.cell = nearestFree(g, l.cell)      // a name written across a line
    l.region = l.cell < 0 ? 0 : outside(l.cell) ? -1 : closed.lab.a[l.cell]
  }

  const owner = new Int32Array(w * h).fill(-1)                           // room index per cell
  const rooms: Array<PlanRoom & { cells: number }> = []
  const growIn = (seeds: number[], ids: number[], allowed: (k: number) => boolean, reach: number) => grow(g, soft, seeds, ids, owner, allowed, reach)
  const addRoom = (name: string, from: PlanRoom['from'], outdoor: boolean, at?: Pt) => { rooms.push({ name, rect: [0, 0, 0, 0], area: 0, outdoor, from, at, tiles: [], cells: 0 }); return rooms.length - 1 }
  const notes: PlanNote[] = labels.filter(l => l.kind !== 'room' && l.kind !== 'dimension').map(l => ({ text: l.text, at: centre(l.box), box: l.box, kind: l.kind === 'fixture' ? 'fixture' as const : 'note' as const }))

  // regions with names: one name → the whole region; several → divide, preferring implied walls as the dividing lines
  const byRegion = new Map<number, typeof roomLabels>()
  for (const l of roomLabels) if (l.region > 0) byRegion.set(l.region, [...(byRegion.get(l.region) ?? []), l])
  for (const [region, ls] of byRegion) {
    // a much smaller name inside a room (a pantry cupboard in a kitchen, a nook) labels a corner of it, not a room
    const big = Math.max(...ls.map(l => l.size)), main = ls.filter(l => l.size >= .5 * big)
    for (const l of ls) if (!main.includes(l)) notes.push({ text: l.text, at: l.c, box: l.box, kind: 'room' })
    // the same name written twice in one space (a long living room) is one room
    const names = [...new Set(main.map(l => l.text))]
    if (names.length === 1) { const id = addRoom(names[0], 'label', OUTDOOR.test(names[0]), main[0].c); for (let k = 0; k < w * h; k++) if (closed.lab.a[k] === region) owner[k] = id; continue }
    const idOf = new Map(names.map(n => [n, addRoom(n, 'split', OUTDOOR.test(n), main.find(l => l.text === n)!.c)]))
    divide(g, soft, owner, k => closed.lab.a[k] === region, main.map(l => ({ cell: l.cell, id: idOf.get(l.text)! })))
  }
  // closed regions nobody named
  const unnamed = new Map<number, number>()
  for (let k = 0; k < w * h; k++) { const r = closed.lab.a[k]; if (r && owner[k] < 0 && !byRegion.has(r)) unnamed.set(r, (unnamed.get(r) ?? 0) + 1) }
  for (const [region, cells] of unnamed) {
    if (cells * (CELL / PX_PER_M) ** 2 < 1.2) continue
    const id = addRoom('', 'guess', false)
    for (let k = 0; k < w * h; k++) if (closed.lab.a[k] === region) owner[k] = id
  }
  // a room is one connected piece: what the division left detached from the name (a passage behind a wall) is its own space
  for (let id = 0, n0 = rooms.length; id < n0; id++) {
    const comp = components(g, k => owner[k] === id); if (comp.sizes.length <= 2) continue
    const at = rooms[id].at ? cellOf(rooms[id].at!) : -1
    let keep = at >= 0 ? comp.lab.a[at] : 0
    if (!keep) keep = comp.sizes.indexOf(Math.max(...comp.sizes.slice(1)), 1)
    const fresh = new Map<number, number>()
    for (let k = 0; k < w * h; k++) {
      const c = comp.lab.a[k]; if (!c || c === keep) continue
      if (comp.sizes[c] * (CELL / PX_PER_M) ** 2 < 1.2) continue                      // a sliver stays with the room
      if (!fresh.has(c)) fresh.set(c, addRoom('', 'guess', false))
      owner[k] = fresh.get(c)!
    }
  }
  // an entrance is often named outside its door ("מבואת כניסה" with an arrow): the name belongs to the unnamed room behind that door
  const named = new Set<(typeof roomLabels)[number]>()
  for (const l of roomLabels) {
    if (l.region !== -1 || !ENTRANCE.test(l.text)) continue
    const doors = ops.filter(o => o.kind === 'door' && !skip.has(o)).map(o => ({ o, d: Math.hypot((o.axis === 'h' ? (o.from + o.to) / 2 : o.at) - l.c[0], (o.axis === 'h' ? o.at : (o.from + o.to) / 2) - l.c[1]) })).filter(x => x.d < 320).sort((a, b) => a.d - b.d)
    for (const { o } of doors) {
      const mid = (o.from + o.to) / 2, sides = (o.axis === 'h' ? [[mid, o.at - 28], [mid, o.at + 28]] : [[o.at - 28, mid], [o.at + 28, mid]]).map(q => { const k = cellOf(q as Pt); return k < 0 ? -1 : owner[k] })
      const id = sides.find(i => i >= 0 && rooms[i].from === 'guess' && !rooms[i].name)
      if (id == null) continue
      rooms[id].name = l.text; rooms[id].from = 'label'; named.add(l); break
    }
  }
  // names written outside (terraces, gardens): the open ground nearest each name, within reach
  const outLabels = roomLabels.filter(l => l.region === -1 && !named.has(l))
  if (outLabels.length) growIn(outLabels.map(l => l.cell), outLabels.map(l => addRoom(l.text, 'label', true, l.c)), k => outside(k), 520 / CELL)

  // measure
  const box = rooms.map(() => [Infinity, Infinity, -Infinity, -Infinity] as Box)
  for (let k = 0; k < w * h; k++) { const o = owner[k]; if (o < 0) continue; const i = k % w, j = (k - i) / w, b = box[o]; if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i > b[2]) b[2] = i; if (j > b[3]) b[3] = j; rooms[o].cells++ }
  rooms.forEach((r, o) => { const b = box[o]; r.rect = [Math.round(g.ox + b[0] * CELL), Math.round(g.oy + b[1] * CELL), Math.round(g.ox + (b[2] + 1) * CELL), Math.round(g.oy + (b[3] + 1) * CELL)]; r.area = +(r.cells * (CELL / PX_PER_M) ** 2).toFixed(2) })
  // floor tiles: each room's cells on a coarse lattice, merged into rectangles (runs along x, then stacked along y)
  {
    const q = TILE / CELL, tw = Math.ceil(w / q), th = Math.ceil(h / q), votes = new Map<number, Map<number, number>>()
    for (let k = 0; k < w * h; k++) { const o = owner[k]; if (o < 0) continue; const i = k % w, j = (k - i) / w, t = Math.floor(j / q) * tw + Math.floor(i / q); const m = votes.get(t) ?? new Map(); m.set(o, (m.get(o) ?? 0) + 1); votes.set(t, m) }
    const tile = new Int32Array(tw * th).fill(-1)
    for (const [t, m] of votes) { const [o, n] = [...m].sort((a, b) => b[1] - a[1])[0]; if (n >= q * q * .3) tile[t] = o }
    const open = new Map<string, Box>()                                 // runs still growing downwards, keyed by room:x1:x2
    for (let j = 0; j <= th; j++) {
      const seen = new Set<string>()
      for (let i = 0; i < tw && j < th;) {
        const o = tile[j * tw + i]; if (o < 0) { i++; continue }
        let e = i; while (e < tw && tile[j * tw + e] === o) e++
        const key = `${o}:${i}:${e}`; seen.add(key)
        const b = open.get(key); if (b) b[3] = j + 1; else open.set(key, [i, j, e, j + 1])
        i = e
      }
      for (const [key, b] of open) if (!seen.has(key)) { rooms[Number(key.split(':')[0])].tiles.push([Math.round(g.ox + b[0] * TILE), Math.round(g.oy + b[1] * TILE), Math.round(g.ox + b[2] * TILE), Math.round(g.oy + b[3] * TILE)]); open.delete(key) }
    }
  }
  // a room named from outside has no place for its name yet: the middle of its largest piece of floor
  for (const r of rooms) if (!r.at && r.name && !r.outdoor && r.tiles.length) { const t = [...r.tiles].sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))[0]; r.at = [Math.round((t[0] + t[2]) / 2), Math.round((t[1] + t[3]) / 2)] }
  for (const r of rooms) if (!r.name) { const W = (r.rect[2] - r.rect[0]) / PX_PER_M, D = (r.rect[3] - r.rect[1]) / PX_PER_M; r.name = Math.min(W, D) < 1.7 ? 'מעבר' : 'חלל' }

  // openings: a door swing is a door; glazing is a glass door when it opens onto a named outdoor space or is very wide
  const roomAt = (x: number, y: number) => { const k = cellOf([x, y]); return k < 0 || owner[k] < 0 ? null : rooms[owner[k]] }
  // cabinets and sinks written along a wall: glazing above them is a window however wide it is
  const counters = notes.filter(n => COUNTER.test(n.text))
  const openings: PlanOpening[] = ops.flatMap((o, n): PlanOpening[] => {
    if (skip.has(o)) return []
    return [classify(o, n)]
  })
  function classify(o: PxOpening, n: number): PlanOpening {
    const b = bands[n], rect: Box = [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])]
    if (o.kind === 'door') return { kind: 'door', rect, axis: o.axis, sill: 0, head: 2.1, hinge: o.hinge, swing: o.swing, sure: true }
    const mid = (o.from + o.to) / 2, off = (o.axis === 'h' ? b[3] - b[1] : b[2] - b[0]) / 2 + 14
    const sides = o.axis === 'h' ? [roomAt(mid, o.at - off), roomAt(mid, o.at + off)] : [roomAt(o.at - off, mid), roomAt(o.at + off, mid)]
    const len = (o.to - o.from) / PX_PER_M
    const toOutdoorRoom = sides.some(s => s?.outdoor), wet = sides.some(s => s && WET.test(s.name))
    // only the in-between widths are a real question: a short opening is a window, a very wide one a glass wall
    const overCounter = counters.filter(c => (o.axis === 'h' ? c.at[0] > o.from - 10 && c.at[0] < o.to + 10 && Math.abs(c.at[1] - o.at) < 75 : c.at[1] > o.from - 10 && c.at[1] < o.to + 10 && Math.abs(c.at[0] - o.at) < 75)).length
    if (overCounter >= 1 && !wet) return { kind: 'window', rect, axis: o.axis, sill: 1.05, head: 2.2, sure: true }
    if (len >= 2 || (toOutdoorRoom && len >= 1.8)) return { kind: 'glass-door', rect, axis: o.axis, sill: 0, head: 2.5, sure: toOutdoorRoom || len >= 2.4 }
    return { kind: 'window', rect, axis: o.axis, sill: wet ? 1.5 : 1, head: 2.2, sure: len < 1.4 }
  }
  // glazing that turns a corner with a glass door is part of the same glass wall
  const touch = (a: Box, b: Box) => dist(a, b) < 14
  for (let again = true; again;) { again = false; for (const o of openings) if (o.kind === 'window' && o.axis && openings.some(d => d.kind === 'glass-door' && d.axis !== o.axis && touch(d.rect, o.rect))) { o.kind = 'glass-door'; o.sill = 0; o.head = 2.5; again = true } }

  const out = rooms.filter(r => r.cells > 0).map(({ cells, ...r }) => r).sort((a, b) => Number(a.outdoor) - Number(b.outdoor) || a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0])
  return { rooms: out, openings, notes, stairs, railings, debug: { g, owner, outside } }
}

/** Nearest free cell to `k` (labels are sometimes written across a furniture or wall line). */
function nearestFree(g: Grid, k: number): number {
  const { w, h } = g, i0 = k % w, j0 = (k - i0) / w
  for (let r = 1; r < 40; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
    const i = i0 + di, j = j0 + dj
    if (i >= 0 && j >= 0 && i < w && j < h && g.a[j * w + i] === 0) return j * w + i
  }
  return k
}

/**
 * Divide one closed region between several names with straight cuts, the way a plan reads: each cut runs along x or y,
 * separates the names into two groups, and is the one crossing the least open floor (it lands on narrowings; implied
 * walls are free to cut along, drawn lines cheap). Repeats inside each part until every part has one name.
 */
function divide(g: Grid, soft: Uint8Array, owner: Int32Array, inRegion: (k: number) => boolean, seeds: Array<{ cell: number; id: number }>) {
  const { w, h } = g
  const cells: number[] = []; for (let k = 0; k < w * h; k++) if (inRegion(k) && (g.a[k] === 0 || g.a[k] === 2)) cells.push(k)
  const weight = (k: number) => (g.a[k] === 2 ? 0 : soft[k] ? .35 : 1)
  const rec = (part: number[], ss: Array<{ cell: number; id: number }>) => {
    const ids = [...new Set(ss.map(s => s.id))]
    if (ids.length <= 1) { for (const k of part) owner[k] = ids[0] ?? -1; return }
    let best: { axis: 0 | 1; c: number; cost: number; mid: number } | null = null
    for (const axis of [0, 1] as const) {
      const at = (k: number) => (axis === 0 ? k % w : Math.floor(k / w))
      // cost of cutting at each coordinate = open floor on that line
      const cost = new Map<number, number>(); for (const k of part) cost.set(at(k), (cost.get(at(k)) ?? 0) + weight(k))
      // candidate cuts lie strictly between two names that differ
      const pos = ss.map(s => ({ v: at(s.cell), id: s.id })).sort((a, b) => a.v - b.v)
      for (let i = 0; i + 1 < pos.length; i++) {
        const lo = pos[i].v, hi = pos[i + 1].v
        if (hi - lo < 16) continue
        // a cut here must not put the same name on both sides
        const left = new Set(pos.slice(0, i + 1).map(p => p.id)), right = new Set(pos.slice(i + 1).map(p => p.id))
        if ([...left].some(id => right.has(id))) continue
        const mid = (lo + hi) / 2
        for (let c = lo + 8; c <= hi - 8; c++) {
          const v = cost.get(c) ?? 0
          if (!best || v < best.cost - 2 || (Math.abs(v - best.cost) <= 2 && Math.abs(c - mid) < Math.abs(best.c - best.mid))) best = { axis, c, cost: v, mid }
        }
      }
    }
    if (!best) { for (const k of part) owner[k] = ids[0]; return }           // names on top of each other: leave as one
    const at = (k: number) => (best!.axis === 0 ? k % w : Math.floor(k / w))
    rec(part.filter(k => at(k) < best!.c), ss.filter(s => at(s.cell) < best!.c))
    rec(part.filter(k => at(k) >= best!.c), ss.filter(s => at(s.cell) >= best!.c))
  }
  rec(cells, seeds.filter(s => s.cell >= 0))
}

/** Dijkstra from several seeds over cells where `allowed`; implied walls (2) are expensive to cross, so borders settle on them. */
function grow(g: Grid, soft: Uint8Array, seeds: number[], ids: number[], owner: Int32Array, allowed: (k: number) => boolean, reach: number) {
  const { w, h } = g, cost = new Float32Array(w * h).fill(Infinity)
  const heap: Array<[number, number, number]> = []                     // cost, cell, id
  const push = (e: [number, number, number]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
  seeds.forEach((s, n) => { if (s >= 0) { cost[s] = 0; push([0, s, ids[n]]) } })
  const claimed = new Int32Array(w * h).fill(-1)
  while (heap.length) {
    const [c, k, id] = pop()
    if (c > cost[k] || claimed[k] >= 0) continue
    claimed[k] = id; owner[k] = id
    const i = k % w
    for (const m of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, k - w, k + w]) {
      if (m < 0 || m >= w * h || claimed[m] >= 0 || !(g.a[m] === 0 || g.a[m] === 2) || !allowed(m)) continue
      const nc = c + (g.a[m] === 2 ? IMPLIED_COST : soft[m] ? DRAWN_COST : 1)
      if (nc < cost[m] && nc <= reach) { cost[m] = nc; push([nc, m, id]) }
    }
  }
}

/** Barriers continuing each wall tip (an edge no longer than a wall is thick) straight on until the next boundary. */
function extensions(p: Poly, g: Grid): Poly[] {
  const out: Poly[] = []
  let sa = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) sa += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1])
  const ccw = sa > 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    if (len < 6 || len > 34 || (Math.abs(dx) > .5 && Math.abs(dy) > .5)) continue
    let nx = dy / len, ny = -dx / len; if (!ccw) { nx = -nx; ny = -ny }
    const prev = p[(i - 1 + p.length) % p.length], next = p[(i + 2) % p.length]
    const back = (q: number[], o: number[]) => ((q[0] - o[0]) * nx + (q[1] - o[1]) * ny) < -len
    if (!back(prev, a) || !back(next, b)) continue
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    let hit = -1
    for (let t = g.cell * 1.5; t <= EXTEND; t += g.cell) { const v = g.get(Math.floor((mx + nx * t - g.ox) / g.cell), Math.floor((my + ny * t - g.oy) / g.cell)); if (v === 1 || v >= 3) { hit = t; break } }
    if (hit < g.cell * 3) continue                                     // nothing ahead, or the tip already meets a door / window
    out.push([a, b, [b[0] + nx * hit, b[1] + ny * hit], [a[0] + nx * hit, a[1] + ny * hit]])
  }
  return out
}
