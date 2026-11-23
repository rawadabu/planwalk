import type { House, Floor, Item, StoreyId } from '@planwalk/house'
import { PX_PER_M, type Plan, type PlanStorey } from './sheet'
import type { Poly } from './plan'
import { furnish, paved, balconyRails } from './content'
import { Grid, close } from './raster'

/** plan@1 → house@1 (what the viewer walks through) plus one minimap SVG per storey. */
export interface HouseOptions { id?: string; title?: string; file?: string }
const H = 2.8, STOREY = 3.05
type Box4 = [number, number, number, number]
const overlap = (a: number[], b: number[], m = 0) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > m && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > m

export function toHouse(plan: Plan, opts: HouseOptions = {}): { house: House; maps: Record<string, string>; warnings: string[] } {
  const warnings = [...plan.warnings]
  const floors = {} as Record<StoreyId, Floor>, maps: Record<string, string> = {}, items: Item[] = []
  const flights: Array<{ base: StoreyId; treads: Box4[]; rise: number; box: Box4 }> = []
  const top = Math.max(...plan.storeys.map(s => s.storey))
  for (const s of [0, 1, 2] as StoreyId[]) {
    const st = plan.storeys.find(p => p.storey === s)
    if (!st) { floors[s] = { name: `קומה ${s}`, bounds: [0, 0, 100, 100], map: '', start: { x: 50, y: 50, yaw: 0 }, walls: [], glass: [], rooms: [], indoor: 0, rects: [] }; warnings.push(`the sheet has no storey ${s}`); continue }
    const indoor = st.rooms.filter(r => !r.outdoor && !r.void).sort((a, b) => a.area - b.area)          // small rooms first: lookups take the first match
    const rest = [...st.rooms.filter(r => r.void), ...st.rooms.filter(r => r.outdoor)]
    // a room's size as written on plans: of the room itself when it is a rectangle, of its main rectangle when it has
    // a nook or an entry notch, and as an area when it is a real L or U shape
    const cm = (px: number) => Math.round(px / PX_PER_M * 10) * 10
    const dims = (r: PlanStorey['rooms'][number]) => {
      const w = r.rect[2] - r.rect[0], d = r.rect[3] - r.rect[1], full = r.area * PX_PER_M * PX_PER_M
      if (full >= .88 * w * d) return `${cm(w)} × ${cm(d)}`
      const m = typical(r.tiles)
      return m && Math.abs(m[0] * m[1] - full) <= .15 * full ? `${cm(m[0])} × ${cm(m[1])}` : `${r.area.toFixed(1)} מ"ר`
    }
    const tuple = (r: PlanStorey['rooms'][number]): Floor['rooms'][number] => [r.name, r.void || r.outdoor ? '' : dims(r), r.rect[0], r.rect[1], r.rect[2], r.rect[3]]
    const big = [...indoor].sort((a, b) => b.area - a.area)[0]
    const start = big?.at ? { x: Math.round(big.at[0]), y: Math.round(big.at[1] + 40), yaw: 0 } : { x: (st.bounds[0] + st.bounds[2]) / 2, y: (st.bounds[1] + st.bounds[3]) / 2, yaw: 0 }
    const map = `plan_f${s}.svg`
    floors[s] = {
      name: st.name, bounds: st.bounds as Floor['bounds'], map, start, walls: st.walls as Floor['walls'],
      glass: st.openings.filter(o => o.kind !== 'door').map(o => [o.rect[0], o.rect[1], o.rect[2], o.rect[3], o.sill, o.head]),
      rooms: [...indoor.map(tuple), ...rest.map(tuple), ['חוץ', '', -9999, -9999, 99999, 99999]], indoor: indoor.length,
      // what stops a walker besides walls: railings, and the open floor of a double-height space
      rects: [...st.railings.map(r => r.map(Math.round) as Box4), ...st.rooms.filter(r => r.void).flatMap(r => r.tiles)],
    }
    maps[map] = svg(st)
    for (const r of indoor) for (const t of r.tiles) items.push({ k: 'box', f: s, layer: 'arch', r: t, y: [-.02, 0], m: 'floor' })
    // the structural slab under this storey: one continuous plate under rooms and the walls between them, open only
    // at the double-height space and the stairwell
    const holes = [...st.rooms.filter(r => r.void).flatMap(r => r.tiles), ...st.stairs.map(x => x.box)]
    if (s > 0) for (const t of plate(indoor.flatMap(r => r.tiles), holes)) items.push({ k: 'box', f: s, layer: 'arch', r: t, y: [-.25, -.02], m: 'ceil' })
    // the roof covers the whole top storey: rooms, walls, the double-height space and the stairwell
    if (s === top) for (const t of plate([...indoor.flatMap(r => r.tiles), ...holes], [])) items.push({ k: 'box', f: s, layer: 'roof', r: [t[0] - 12, t[1] - 12, t[2] + 12, t[3] + 12], y: [H, H + .3], m: 'ceil' })
    for (const o of st.openings) if (o.kind === 'door') items.push({ k: 'opening', f: s, r: o.rect, head: o.head })
    for (const t of furnish(st)) items.push({ ...t, f: s } as Item)
    const terrace = paved(st)
    for (const b of terrace) items.push({ k: 'box', f: s, layer: 'outdoor', r: b.map(Math.round) as Box4, y: s > 0 ? [-.2, 0] : [-.04, .005], m: 'deck' })
    // upper-storey balconies get a glass railing along their open edges
    if (s > 0) for (const r of balconyRails(st, terrace)) { const b = r.map(Math.round) as Box4; floors[s].rects.push(b); items.push({ k: 'box', f: s, layer: 'outdoor', r: b, y: [.02, 1.05], m: 'railGlass' }, { k: 'box', f: s, layer: 'outdoor', r: b, y: [1.05, 1.09], m: 'metal' }) }
    // railings: glass with a metal rail
    for (const r of st.railings) { const b: [number, number, number, number] = [Math.round(r[0] - 1), Math.round(r[1] - 1), Math.round(r[2] + 1), Math.round(r[3] + 1)]; items.push({ k: 'box', f: s, layer: 'int', r: b, y: [.05, 1], m: 'railGlass' }, { k: 'box', f: s, layer: 'int', r: b, y: [1, 1.04], m: 'metal' }) }
    // the stair up from this storey: drawn complete on the storey above; the bottom steps may only show here
    const up = plan.storeys.find(p => p.storey === s + 1)
    const here = st.stairs[0], above = up?.stairs.find(a => here && overlap(a.box, here.box))
    if (here && above) {
      const lead: Box4[] = []
      if (here.ordered) for (const t of here.treads) { if (above.treads.some(a => overlap(a, t, 4))) break; lead.push(t) }
      const treads = [...lead, ...above.treads].map(t => t.map(Math.round) as Box4)
      const rise = STOREY / (treads.length + 1)
      items.push({ k: 'steps', f: s, layer: 'int', treads, rise })
      if (!above.ordered) warnings.push(`storey ${s}: no up-arrow on the stair; step order is a guess`)
      flights.push({ base: s, treads, rise, box: above.box.map(Math.round) as Box4 })
    }
    // under the lowest stair there is floor
    if (here && s === Math.min(...plan.storeys.map(p => p.storey))) items.push({ k: 'box', f: s, layer: 'arch', r: here.box.map(Math.round) as Box4, y: [-.02, 0], m: 'floor' })
  }
  // the plot: the street is on the side of the entrance / parking; a twin house has its other unit across the party wall
  const ground = plan.storeys.find(p => p.storey === 0) ?? plan.storeys[0]
  const cx = (ground.bounds[0] + ground.bounds[2]) / 2, cy = (ground.bounds[1] + ground.bounds[3]) / 2
  const entry = ground.rooms.find(r => r.outdoor && r.at && /כניסה|חניה|חנייה/.test(r.name))
  let street: 'x+' | 'x-' | 'y+' | 'y-' = 'y-'
  if (entry?.at) { const dx = entry.at[0] - cx, dy = entry.at[1] - cy; street = Math.abs(dy) >= Math.abs(dx) * .6 ? (dy < 0 ? 'y-' : 'y+') : (dx < 0 ? 'x-' : 'x+') }
  else warnings.push('the street side is a guess (no entrance or parking is named on the ground floor)')
  const parties = plan.storeys.map(p => p.party).filter((v): v is number => v !== null).sort((a, b) => a - b)
  const party = parties.length ? parties[Math.floor(parties.length / 2)] : null
  const site: House['site'] = { street, ...(party !== null ? { twin: { side: cx < party ? 'x+' as const : 'x-' as const, at: party } } : {}) }
  if (site.twin && street[0] === 'x') site.street = 'y-'                 // a twin's street runs across both units

  if (plan.storeys.some(s => s.storey < 0 || s.storey > 2)) warnings.push('storeys outside ground…second are not built yet')
  const house: House = {
    format: 'house@1', id: opts.id ?? 'auto', title: opts.title ?? 'בית מתוכנית',
    source: { file: opts.file ?? 'plan.pdf', scale: plan.scale.written ? `1:${plan.scale.written}` : '1:100', pxPerMetre: PX_PER_M, note: `pipeline v2 · scale from ${plan.scale.agree} dimensions` },
    storey: { height: H, slab: .25, assumed: true }, floors: floors as House['floors'], void: [],
    stairs: walkable(flights, floors, plan), canopies: [], site, items,
  }
  return { house, maps, warnings }
}

/**
 * Stairs you can walk: for every flight a path over its treads (foot → each tread → the floor above), where walking
 * into it starts the climb or the descent, and a blocked footprint so nobody walks through the steps or the stairwell.
 */
function walkable(flights: Array<{ base: StoreyId; treads: Box4[]; rise: number; box: Box4 }>, floors: Record<StoreyId, Floor>, plan: Plan): House['stairs'] {
  const out: House['stairs'] = { step: .01, path: {}, exit: {}, trigger: {}, zone: {}, arrive: {}, down: {} }
  const c = (t: Box4): [number, number] => [(t[0] + t[2]) / 2, (t[1] + t[3]) / 2]
  const unit = (a: [number, number], b: [number, number]): [number, number] => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
  const yawOf = (d: [number, number]) => Math.atan2(-d[0], -d[1])
  const floorAt = (s: StoreyId, x: number, y: number, box: Box4) => {
    const st = plan.storeys.find(p => p.storey === s); if (!st) return false
    if (x > box[0] - 30 && x < box[2] + 30 && y > box[1] - 30 && y < box[3] + 30) return false                      // clear of the steps themselves
    return st.rooms.some(r => !r.outdoor && !r.void && r.tiles.some(t => x >= t[0] + 20 && x <= t[2] - 20 && y >= t[1] + 20 && y <= t[3] - 20))
  }
  // a standing spot just off a tread, straight on or (at a landing) to either side
  const stand = (s: StoreyId, from: [number, number], d: [number, number], box: Box4): [number, number] => {
    for (const reach of [50, 70, 95, 125]) for (const [dx, dy] of [d, [-d[1], d[0]], [d[1], -d[0]]] as Array<[number, number]>) { const x = from[0] + dx * reach, y = from[1] + dy * reach; if (floorAt(s, x, y, box)) return [Math.round(x), Math.round(y)] }
    return [Math.round(from[0] + d[0] * 60), Math.round(from[1] + d[1] * 60)]
  }
  for (const f of flights) {
    const n = f.treads.length; if (n < 2) continue
    const up = (f.base + 1) as StoreyId, tb = f.treads.reduce((b, t) => [Math.min(b[0], t[0]), Math.min(b[1], t[1]), Math.max(b[2], t[2]), Math.max(b[3], t[3])] as Box4, [Infinity, Infinity, -Infinity, -Infinity] as Box4)
    const d0 = unit(c(f.treads[0]), c(f.treads[1])), d1 = unit(c(f.treads[n - 2]), c(f.treads[n - 1]))
    const foot = stand(f.base, c(f.treads[0]), [-d0[0], -d0[1]], tb), top = stand(up, c(f.treads[n - 1]), d1, f.box)
    out.path[f.base] = [[foot[0], foot[1], 0], ...f.treads.map((t, i): [number, number, number] => [Math.round(c(t)[0]), Math.round(c(t)[1]), Math.round((i + 1) * f.rise * 100)])]
    out.exit[f.base] = top
    out.trigger[f.base] = [foot[0], foot[1], 75, unit(foot, c(f.treads[0]))]
    out.down![up] = [top[0], top[1], 75, unit(top, c(f.treads[n - 1]))]
    out.arrive[f.base] ??= { x: foot[0], y: foot[1], yaw: yawOf(unit(c(f.treads[0]), foot)) }
    out.arrive[up] = { x: top[0], y: top[1], yaw: yawOf(d1) }
    const pad = 110, z = (b: Box4): Box4 => [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
    const join = (a: Box4 | undefined, b: Box4): Box4 => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b)
    out.zone[f.base] = join(out.zone[f.base] as Box4 | undefined, z(tb)); out.zone[up] = join(out.zone[up] as Box4 | undefined, z(f.box))
    // nobody walks through the steps (below) or into the stairwell (above)
    floors[f.base].rects.push(tb); floors[up].rects.push(f.box)
  }
  return out
}

/** The usual width and depth of a room made of tiles: the median extent across its rows and across its columns. */
function typical(tiles: number[][]): [number, number] | null {
  if (!tiles.length) return null
  const median = (axis: 0 | 1) => {
    const o = 1 - axis, cuts = [...new Set(tiles.flatMap(t => [t[o], t[o + 2]]))].sort((a, b) => a - b)
    const strips: Array<{ len: number; weight: number }> = []
    for (let i = 0; i + 1 < cuts.length; i++) {
      const mid = (cuts[i] + cuts[i + 1]) / 2, hit = tiles.filter(t => mid > t[o] && mid < t[o + 2])
      if (hit.length) strips.push({ len: Math.max(...hit.map(t => t[axis + 2])) - Math.min(...hit.map(t => t[axis])), weight: cuts[i + 1] - cuts[i] })
    }
    strips.sort((a, b) => a.len - b.len)
    let half = strips.reduce((n, x) => n + x.weight, 0) / 2
    for (const x of strips) { half -= x.weight; if (half <= 0) return x.len }
    return strips[strips.length - 1]?.len ?? 0
  }
  return [median(0), median(1)]
}

/** Rectangles covering `tiles` and the wall-wide gaps between them (a closing on a 10 px lattice), minus `holes`. */
function plate(tiles: number[][], holes: number[][]): Box4[] {
  if (!tiles.length) return []
  const Q = 10, x0 = Math.min(...tiles.map(t => t[0])) - 4 * Q, y0 = Math.min(...tiles.map(t => t[1])) - 4 * Q
  const g = new Grid(Math.ceil((Math.max(...tiles.map(t => t[2])) - x0) / Q) + 4, Math.ceil((Math.max(...tiles.map(t => t[3])) - y0) / Q) + 4, Q, x0, y0)
  for (const t of tiles) g.fill([[t[0], t[1]], [t[2], t[1]], [t[2], t[3]], [t[0], t[3]]])
  const m = close(g, 3)                                               // bridges gaps up to ~50 cm: the walls
  const cut = g.like(); for (const t of holes) cut.fill([[t[0] + Q, t[1] + Q], [t[2] - Q, t[1] + Q], [t[2] - Q, t[3] - Q], [t[0] + Q, t[3] - Q]])
  const out: Box4[] = [], open = new Map<string, Box4>()
  for (let j = 0; j <= m.h; j++) {
    const seen = new Set<string>()
    for (let i = 0; i < m.w && j < m.h;) {
      const on = (ii: number) => m.a[j * m.w + ii] === 1 && !cut.a[j * m.w + ii]
      if (!on(i)) { i++; continue }
      let e = i; while (e < m.w && on(e)) e++
      const key = `${i}:${e}`; seen.add(key)
      const b = open.get(key); if (b) b[3] = y0 + (j + 1) * Q; else open.set(key, [x0 + i * Q, y0 + j * Q, x0 + e * Q, y0 + (j + 1) * Q])
      i = e
    }
    for (const [key, b] of open) if (!seen.has(key)) { out.push(b); open.delete(key) }
  }
  return out
}

/** Minimap: rooms tinted with their names, walls in ink, glazing in blue. */
function svg(st: PlanStorey) {
  const [x1, y1, x2, y2] = st.bounds, esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const path = (st.walls as Poly[]).map(p => 'M' + p.map(([x, y]) => `${x} ${y}`).join('L') + 'Z').join('')
  const tiles = st.rooms.filter(r => !r.outdoor).map(r => r.tiles.map(t => `<rect x="${t[0]}" y="${t[1]}" width="${t[2] - t[0]}" height="${t[3] - t[1]}" fill="${r.void ? '#f1f5f9' : '#eef2f6'}"/>`).join('')).join('')
  const names = st.rooms.filter(r => r.at && r.at[0] > x1 && r.at[0] < x2 && r.at[1] > y1 && r.at[1] < y2).map(r => `<text x="${r.at![0]}" y="${r.at![1]}" font-size="34" text-anchor="middle" fill="#475569" font-family="sans-serif">${esc(r.name)}</text>`).join('')
  const glass = st.openings.filter(o => o.kind !== 'door').map(o => `<rect x="${o.rect[0]}" y="${o.rect[1]}" width="${o.rect[2] - o.rect[0]}" height="${o.rect[3] - o.rect[1]}" fill="#38bdf8"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x1} ${y1} ${x2 - x1} ${y2 - y1}" width="${x2 - x1}" height="${y2 - y1}"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="#fff"/>${tiles}<path d="${path}" fill="#1f2933"/>${glass}${names}</svg>`
}
