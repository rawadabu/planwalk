import type { House, Item } from '@planwalk/house'
import { emptyDesign, type Design } from './schema'
import { STYLES, withStyle } from './styles'
import { thing, type AddEdit } from './furnish'

/**
 * The design brief: a few questions a home's owners answer once, and the first design made from the answers, so that
 * nobody walks into an empty house. Everything it produces is an ordinary design: finishes from the catalogue and
 * pieces from the furniture catalogue, each of which the owners can then move, turn, replace or remove.
 */
export interface Brief {
  style: 'modern-white' | 'warm-scandi' | 'dark-luxury'
  /** a colour for the bedrooms' walls */
  accent: 'none' | 'sage' | 'clay' | 'mist-blue' | 'charcoal'
  floor: 'style' | 'wood' | 'tile'
  kids: number
  workFromHome: boolean
  /** how the living room is used */
  living: Array<'tv' | 'reading' | 'plants'>
  /** what the garden and balconies are for */
  outdoor: Array<'dining' | 'lounge' | 'green' | 'bbq'>
  /** how much to put in: the essentials, a lived-in home, or fully dressed */
  level: 'minimal' | 'cozy' | 'full'
  note?: string
}
export const DEFAULT_BRIEF: Brief = { style: 'warm-scandi', accent: 'none', floor: 'style', kids: 2, workFromHome: false, living: ['tv', 'plants'], outdoor: ['dining', 'green'], level: 'cozy' }

/** Validate a brief from untrusted input (a saved one, a request body); unknown or missing answers fall back to the defaults. */
export function parseBrief(x: unknown): Brief {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>, d = DEFAULT_BRIEF
  const one = <T extends string>(v: unknown, all: readonly T[], def: T): T => (all.includes(v as T) ? (v as T) : def)
  const many = <T extends string>(v: unknown, all: readonly T[], def: T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((y): y is T => all.includes(y as T)))] : def)
  return {
    style: one(o.style, ['modern-white', 'warm-scandi', 'dark-luxury'] as const, d.style), accent: one(o.accent, ['none', 'sage', 'clay', 'mist-blue', 'charcoal'] as const, d.accent),
    floor: one(o.floor, ['style', 'wood', 'tile'] as const, d.floor), kids: Math.max(0, Math.min(8, Math.round(Number(o.kids ?? d.kids)) || 0)), workFromHome: o.workFromHome === true,
    living: many(o.living, ['tv', 'reading', 'plants'] as const, d.living), outdoor: many(o.outdoor, ['dining', 'lounge', 'green', 'bbq'] as const, d.outdoor),
    level: one(o.level, ['minimal', 'cozy', 'full'] as const, d.level), ...(typeof o.note === 'string' && o.note.trim() ? { note: o.note.trim().slice(0, 1000) } : {}),
  }
}

type R4 = [number, number, number, number]
type F = 0 | 1 | 2
type Model = Extract<Item, { k: 'model' }>
type Room = House['floors'][0]['rooms'][number]
const LIVING = /סלון|מגורים/, SEATING = /ישיבה|משפחה/, BED = /שינה/, KIDS = /ילדים|ילד|נוער/, KITCHEN = /מטבח/, WET = /מקלחת|שירותים|אמבט|רחצה|כביסה/, ENTRY = /מבוא|כניסה|לובי/, SAFE = /ממ"ד|ממ״ד|עבודה|משרד/
const overlap = (a: number[], b: number[], m = 0) => a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m
const inPoly = (p: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
const mid = (r: number[]): [number, number] => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]
const quarter = (rot: number) => ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4
/** the way a piece faces after `q` quarter turns (its front; 0 = down the sheet) */
const FRONT: Array<[number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]]

/** One storey while it is being furnished: what is taken, what must stay clear, and the pieces added so far. */
class Storey {
  taken: R4[] = []; clear: R4[] = []; edits: Array<[string, AddEdit]> = []
  constructor(private house: House, readonly f: F, private px: number, private next: () => string) {
    const fl = house.floors[f]
    for (const it of house.items) {
      if (it.f !== f) continue
      if (it.k === 'steps') { this.taken.push(...(it.treads as R4[])); continue }
      if (!('r' in it)) continue
      if (it.k === 'opening') { const h = it.r[2] - it.r[0] > it.r[3] - it.r[1]; this.clear.push(h ? [it.r[0], it.r[1] - 95, it.r[2], it.r[3] + 95] : [it.r[0] - 95, it.r[1], it.r[2] + 95, it.r[3]]); continue }
      if (it.k === 'box' && (it.layer === 'arch' || it.layer === 'roof' || it.layer === 'outdoor' || it.m === 'quartz')) continue
      if (it.k === 'rug' || it.k === 'slot') continue
      this.taken.push(it.r as R4)
    }
    this.taken.push(...(fl.rects as R4[]))
    // a way through every glass door, and room to reach the stairs
    for (const g of fl.glass) if (g[4] < .3) { const h = g[2] - g[0] > g[3] - g[1]; this.clear.push(h ? [g[0], g[1] - 85, g[2], g[3] + 85] : [g[0] - 85, g[1], g[2] + 85, g[3]]) }
    for (const t of [house.stairs.trigger[f], house.stairs.down?.[f]]) if (t) this.clear.push([t[0] - 110, t[1] - 110, t[0] + 110, t[1] + 110])
  }
  get fl() { return this.house.floors[this.f] }
  inWall(x: number, y: number) { return this.fl.walls.some(p => inPoly(p, x, y)) }
  rooms() { return this.fl.rooms.slice(0, this.fl.indoor) }
  roomAt(x: number, y: number): Room | null { return this.rooms().filter(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5]).sort((a, b) => (a[4] - a[2]) * (a[5] - a[3]) - (b[4] - b[2]) * (b[5] - b[3]))[0] ?? null }
  models(room: Room, names: string[]) { return this.house.items.filter((i): i is Model => i.k === 'model' && i.f === this.f && names.includes(i.name) && this.roomAt(...mid(i.r)) === room) }
  rect(id: string, cx: number, cy: number, turn: number): R4 { const t = thing(id)!, w = (turn % 2 ? t.d : t.w) * this.px / 2, d = (turn % 2 ? t.w : t.d) * this.px / 2; return [cx - w, cy - d, cx + w, cy + d] }
  /** Does this footprint stand on open floor of one room (or, outdoors, inside `within`)? `under`: lies under furniture (a rug). */
  free(r: R4, room: Room | null, opts: { under?: boolean; within?: R4; pad?: number } = {}) {
    for (let x = r[0]; x <= r[2] + .01; x += Math.max(8, (r[2] - r[0]) / Math.ceil((r[2] - r[0]) / 14))) for (let y = r[1]; y <= r[3] + .01; y += Math.max(8, (r[3] - r[1]) / Math.ceil((r[3] - r[1]) / 14))) {
      if (this.inWall(x, y)) return false
      if (opts.within ? !(x >= opts.within[0] && x <= opts.within[2] && y >= opts.within[1] && y <= opts.within[3]) : this.roomAt(x, y) !== room) return false
    }
    if (this.fl.rects.some(q => overlap(r, q, 2))) return false
    if (opts.under) return true
    if (this.taken.some(q => overlap(r, q, opts.pad ?? 6))) return false
    // indoors: doorways, glass doors and the stair stay clear; on a balcony: a step in front of the glass
    return opts.within ? !this.fl.glass.some(g => overlap(r, g, 42)) : !this.clear.some(q => overlap(r, q))
  }
  /** A footprint's centre moved (if needed) so that it lies inside the room's box. */
  into(id: string, room: Room, cx: number, cy: number, turn: number): [number, number] {
    const r = this.rect(id, 0, 0, turn), hw = r[2], hd = r[3], m = 10
    if (room[4] - room[2] < 2 * hw + 2 * m || room[5] - room[3] < 2 * hd + 2 * m) return [cx, cy]
    return [Math.max(room[2] + hw + m, Math.min(room[4] - hw - m, cx)), Math.max(room[3] + hd + m, Math.min(room[5] - hd - m, cy))]
  }
  put(id: string, cx: number, cy: number, turn: number, room: Room | null, opts: { under?: boolean; within?: R4; out?: boolean; pad?: number } = {}) {
    if (!thing(id)) return false
    const r = this.rect(id, cx, cy, turn); if (!this.free(r, room, opts)) return false
    const key = this.next()
    this.edits.push([`add:f${this.f}.${key}`, { k: 'add', floor: this.f, id: key, thing: id, x: Math.round(cx), y: Math.round(cy), turn, ...(opts.out ? { out: true } : {}) }])
    if (!opts.under) this.taken.push(r)
    return true
  }
  /** Stand a piece with its back to a wall of the room. `want`: in a corner, or at the middle of a wall; `solid`: only where the wall is solid behind it. */
  wall(id: string, room: Room, want: 'corner' | 'centre', solid = true) {
    const t = thing(id)!, [, , x1, y1, x2, y2] = room, cands: Array<{ cx: number; cy: number; turn: number; s: number }> = []
    for (const [side, turn] of [['top', 0], ['left', 1], ['bottom', 2], ['right', 3]] as const) {
      const horiz = side === 'top' || side === 'bottom', lo = horiz ? x1 : y1, hi = horiz ? x2 : y2, half = t.w * this.px / 2, deep = t.d * this.px / 2 + 4
      for (let a = lo + half + 6; a <= hi - half - 6; a += 15) {
        const cx = horiz ? a : side === 'left' ? x1 + deep : x2 - deep, cy = horiz ? (side === 'top' ? y1 + deep : y2 - deep) : a
        if (solid) { const bx = horiz ? 0 : side === 'left' ? -1 : 1, by = horiz ? (side === 'top' ? -1 : 1) : 0, edge = horiz ? (side === 'top' ? y1 : y2) : side === 'left' ? x1 : x2
          const behind = [-half * .7, 0, half * .7].every(o => (horiz ? this.inWall(a + o, edge + by * 9) : this.inWall(edge + bx * 9, a + o)))
          if (!behind) continue }
        cands.push({ cx, cy, turn, s: want === 'corner' ? Math.min(a - lo, hi - a) : Math.abs(a - (lo + hi) / 2) })
      }
    }
    for (const c of cands.sort((p, q) => p.s - q.s)) if (this.put(id, c.cx, c.cy, c.turn, room)) return true
    return false
  }
}

/** Terraces of a storey: for every connected paved area outdoors, the largest rectangle that fits in it (big enough to sit on). */
function terraces(house: House, f: F): R4[] {
  const boxes = house.items.filter(i => i.k === 'box' && i.f === f && i.layer === 'outdoor' && i.m === 'deck').map(i => (i as { r: R4 }).r)
  if (!boxes.length) return []
  const Q = 10, x0 = Math.min(...boxes.map(b => b[0])), y0 = Math.min(...boxes.map(b => b[1]))
  const w = Math.ceil((Math.max(...boxes.map(b => b[2])) - x0) / Q), h = Math.ceil((Math.max(...boxes.map(b => b[3])) - y0) / Q)
  const on = new Uint8Array(w * h), lab = new Int32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = x0 + (i + .5) * Q, y = y0 + (j + .5) * Q; if (boxes.some(b => x >= b[0] && x < b[2] && y >= b[1] && y < b[3])) on[j * w + i] = 1 }
  const out: R4[] = []
  for (let s = 0, id = 0; s < w * h; s++) {
    if (!on[s] || lab[s]) continue
    lab[s] = ++id; const stack = [s]
    while (stack.length) { const k = stack.pop()!, i = k % w, j = (k - i) / w; for (const m of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1]) if (m >= 0 && on[m] && !lab[m]) { lab[m] = id; stack.push(m) } }
    // largest rectangle of this area: for every row, the tallest run of filled cells above each column
    const up = new Int32Array(w); let best: R4 | null = null, area = 0
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) up[i] = lab[j * w + i] === id ? up[i] + 1 : 0
      for (let i = 0; i < w; i++) { let min = Infinity; for (let e = i; e < w && up[e] > 0; e++) { min = Math.min(min, up[e]); const a = min * (e - i + 1); if (a > area) { area = a; best = [x0 + i * Q, y0 + (j + 1 - min) * Q, x0 + (e + 1) * Q, y0 + (j + 1) * Q] } } }
    }
    if (best && Math.min(best[2] - best[0], best[3] - best[1]) >= 130 && area * Q * Q >= 130 * 240) out.push(best)
  }
  return out
}

/** The first design for a house, from the owners' answers. Deterministic: the same answers give the same design. */
export function firstDesign(house: House, input: Brief): Design {
  const brief = parseBrief(input), px = house.source.pxPerMetre / 100
  const style = STYLES.find(s => s.id === brief.style) ?? STYLES[1]
  let design = withStyle(emptyDesign(), style)
  const finishes: Record<string, string> = { ...design.finishes }
  if (brief.floor === 'wood') finishes['floor@all'] = brief.style === 'dark-luxury' ? 'wood-oak-smoked' : brief.style === 'modern-white' ? 'wood-oak-white' : 'wood-oak'
  if (brief.floor === 'tile') finishes['floor@all'] = brief.style === 'dark-luxury' ? 'tile-dark' : brief.style === 'warm-scandi' ? 'tile-warm-grey' : 'tile-light'
  const woodFloor = /^wood/.test(finishes['floor@all'])
  let n = 0; const next = () => `b${(n++).toString(36)}`
  const full = brief.level === 'full', some = brief.level !== 'minimal'
  const edits: Array<[string, AddEdit]> = []
  let desks = 0, kidRooms = 0

  for (const f of [0, 1, 2] as F[]) {
    const fl = house.floors[f]; if (!fl.walls.length) continue
    const S = new Storey(house, f, px, next)
    fl.rooms.slice(0, fl.indoor).forEach((room, index) => {
      const name = room[0], [, , x1, y1, x2, y2] = room, w = x2 - x1, d = y2 - y1
      // finishes that depend on the room
      if (WET.test(name) && woodFloor) finishes[`floor@f${f}.r${index}`] = brief.style === 'dark-luxury' ? 'tile-dark' : 'tile-light'
      if (BED.test(name) && brief.accent !== 'none') finishes[`walls@f${f}.r${index}`] = `paint-${brief.accent}`

      if (LIVING.test(name) || SEATING.test(name)) {
        const seats = S.models(room, ['sofa', 'armchair']), tables = S.models(room, ['coffeeTable', 'nestingTable'])
        if (seats.length) {
          const box = seats.reduce((b, i) => [Math.min(b[0], i.r[0]), Math.min(b[1], i.r[1]), Math.max(b[2], i.r[2]), Math.max(b[3], i.r[3])] as R4, [Infinity, Infinity, -Infinity, -Infinity] as R4)
          const sofa = S.models(room, ['sofa']).sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]))[0] ?? seats[0]
          const q = quarter(sofa.rot), [fx, fy] = FRONT[q], [sx, sy] = mid(sofa.r), depth = (q % 2 ? sofa.r[2] - sofa.r[0] : sofa.r[3] - sofa.r[1]) / 2, len = (q % 2 ? sofa.r[3] - sofa.r[1] : sofa.r[2] - sofa.r[0]) / 2
          // a rug in front of the main sofa (under the group when there are several seats), a table on it
          const rc: [number, number] = seats.length > 2 ? mid(box) : [sx + fx * (depth + 100), sy + fy * (depth + 100)]
          for (const [id, turn] of [['rug-large', q % 2], ['rug-small', q % 2], ['rug-small', 1 - (q % 2)]] as const) { const [rx, ry] = S.into(id, room, rc[0], rc[1], turn); if (S.put(id, rx, ry, turn, room, { under: true })) break }
          if (some && !tables.length) S.put('coffee-table', sx + fx * (depth + 75), sy + fy * (depth + 75), q % 2, room) || S.put('side-table', rc[0], rc[1], 0, room)
          // the television on the wall the sofa looks at
          if (some && brief.living.includes('tv') && LIVING.test(name)) {
            let t = depth + 120; while (t < 800 && !S.inWall(sx + fx * t, sy + fy * t)) t += 6
            const back = thing('tv-unit')!.d * px / 2 + 5, ok = t < 800 && S.put('tv-unit', sx + fx * (t - back), sy + fy * (t - back), (q + 2) % 4, room)
            if (!ok) S.wall('tv-unit', room, 'centre')
          }
          if (some) S.put('floor-lamp', sx + (q % 2 ? 0 : len + 32) - fx * (depth - 22), sy + (q % 2 ? len + 32 : 0) - fy * (depth - 22), 0, room) || S.put('floor-lamp', sx - (q % 2 ? 0 : len + 32) - fx * (depth - 22), sy - (q % 2 ? len + 32 : 0) - fy * (depth - 22), 0, room)
          if (full && brief.living.includes('reading')) S.wall('bookshelf', room, 'centre')
        }
        if (brief.living.includes('plants') || full) S.wall('olive-pot', room, 'corner', false)
        if (full) S.wall('plant', room, 'corner', false)
      } else if (BED.test(name)) {
        const beds = S.models(room, ['bedDouble', 'bedSingle']).sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]))
        const kid = KIDS.test(name); if (kid) kidRooms++
        for (const bed of beds) {
          const q = quarter(bed.rot), [fx, fy] = FRONT[q], [bx, by] = mid(bed.r), L = (q % 2 ? bed.r[2] - bed.r[0] : bed.r[3] - bed.r[1]) / 2, W = (q % 2 ? bed.r[3] - bed.r[1] : bed.r[2] - bed.r[0]) / 2
          const ns = thing('nightstand')!, nw = ns.w * px / 2, nd = ns.d * px / 2, ax = -fy, ay = fx                        // across the bed
          let placed = 0
          for (const sd of [1, -1]) if (placed < (beds.length > 1 ? 1 : 2) && S.put('nightstand', bx - fx * (L - nd - 3) + ax * sd * (W + nw + 9), by - fy * (L - nd - 3) + ay * sd * (W + nw + 9), q, room)) placed++
          // a rug under the foot of the bed, wider than the bed where the room allows
          if (some && bed === beds[0]) for (const id of W > 60 ? ['rug-large', 'rug-small'] : ['rug-small']) { const turn = (q % 2 ? 1 : 0), [rx, ry] = S.into(id, room, bx + fx * L * .5, by + fy * L * .5, turn); if (S.put(id, rx, ry, turn, room, { under: true })) break }
        }
        if ((kid && brief.kids > 0 && some) || (!kid && brief.workFromHome && desks === 0 && full)) { if (S.wall('desk', room, 'centre')) { desks++; const d0 = S.edits[S.edits.length - 1][1], [dx, dy] = FRONT[d0.turn]; S.put('desk-chair', d0.x + dx * 62, d0.y + dy * 62, (d0.turn + 2) % 4, room, { pad: 0 }) } }
        if (some) S.wall('plant', room, 'corner', false)
      } else if (KITCHEN.test(name)) {
        const island = S.models(room, ['island'])[0]
        if (island && some) { const [ix, iy] = mid(island.r), along = island.r[2] - island.r[0] >= island.r[3] - island.r[1], l = (along ? island.r[2] - island.r[0] : island.r[3] - island.r[1]) / 2
          for (const o of l > 110 ? [-.5, 0, .5] : [-.35, .35]) S.put('pendant', ix + (along ? o * l * 1.3 : 0), iy + (along ? 0 : o * l * 1.3), 0, room, { under: true }) }
      } else if (ENTRY.test(name)) {
        if (some) S.wall('console', room, 'centre')
        S.wall('plant', room, 'corner', false)
      } else if (SAFE.test(name) && brief.workFromHome && desks === 0) {
        if (S.wall('desk', room, 'centre')) { desks++; const d0 = S.edits[S.edits.length - 1][1], [dx, dy] = FRONT[d0.turn]; S.put('desk-chair', d0.x + dx * 62, d0.y + dy * 62, (d0.turn + 2) % 4, room, { pad: 0 }) }
        if (full) S.wall('bookshelf', room, 'centre')
      } else if (!WET.test(name) && full && Math.min(w, d) > 180) S.wall('plant', room, 'corner', false)
    })

    // balconies: every paved deck large enough to sit on
    if (f > 0 && brief.outdoor.length) for (const r of terraces(house, f)) {
      const w = r[2] - r[0], d = r[3] - r[1], [cx, cy] = mid(r), along = w >= d, opts = { within: [r[0] + 10, r[1] + 10, r[2] - 10, r[3] - 10] as R4, out: true }
      // seating at one end, greenery at the other; try a few spots along the terrace so a door's step stays free
      const spots = [-.3, .3, 0, -.15, .15].map(t => (along ? [cx + t * w, cy] : [cx, cy + t * d]) as [number, number])
      const seat = brief.outdoor.includes('lounge') || !brief.outdoor.includes('dining') ? 'garden-sofa' : 'garden-table'
      const at = spots.find(([x, y]) => S.put(seat, x, y, along ? 0 : 1, null, opts))
      if (at && seat === 'garden-table' && some) for (const sd of [-1, 1]) S.put('garden-chair', at[0] + (along ? sd * 134 : 0), at[1] + (along ? 0 : sd * 134), along ? (sd < 0 ? 1 : 3) : (sd < 0 ? 0 : 2), null, opts)
      if (brief.outdoor.includes('green')) for (const [x, y] of [...spots].reverse()) if (S.put('planter', x, y, along ? 0 : 1, null, opts)) break
    }
    edits.push(...S.edits)
  }

  // the garden: on the ground storey, on the side away from the street
  const g = ([0, 1, 2] as F[]).find(f => house.floors[f].walls.length)
  if (g !== undefined && brief.outdoor.length) {
    const b = house.floors[g].bounds, street = house.site?.street ?? 'y-', S = new Storey(house, g, px, next)
    // (u along the back of the house from its middle, v away from it) → plan
    const at = (u: number, v: number): [number, number] => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return street === 'y-' ? [cx + u, b[3] + v] : street === 'y+' ? [cx - u, b[1] - v] : street === 'x-' ? [b[2] + v, cy + u] : [b[0] - v, cy - u] }
    const turnOut = street === 'y-' ? 0 : street === 'y+' ? 2 : street === 'x-' ? 1 : 3
    // `over`: stands around or above other pieces (a pergola, a parasol); a tree only needs room for its trunk
    const out = (id: string, u: number, v: number, turn = 0, over = false) => {
      const [x, y] = at(u, v), r = S.rect(id, x, y, (turnOut + turn) % 4), foot: R4 = /^tree-/.test(id) ? [x - 35, y - 35, x + 35, y + 35] : r
      if (!over && S.taken.some(q => overlap(foot, q, 8))) return false
      if ([0, .5, 1].some(a => [0, .5, 1].some(c => S.inWall(foot[0] + (foot[2] - foot[0]) * a, foot[1] + (foot[3] - foot[1]) * c)))) return false
      const key = next(); if (!over) S.taken.push(foot)
      edits.push([`add:f${g}.${key}`, { k: 'add', floor: g, id: key, thing: id, x: Math.round(x), y: Math.round(y), turn: (turnOut + turn) % 4, out: true }]); return true
    }
    if (brief.outdoor.includes('dining')) { if (out('garden-table', -150, 240)) { for (const [du, dv, t] of [[-50, -90, 0], [50, -90, 0], [-50, 90, 2], [50, 90, 2]] as const) out('garden-chair', -150 + du, 240 + dv, t); if (some) out('pergola', -150, 240, 0, true) } }
    if (brief.outdoor.includes('lounge')) { out('lounger', 210, 300); out('lounger', 310, 300); if (some) out('parasol', 260, 250, 0, true) }
    if (brief.outdoor.includes('bbq')) out('bbq', 60, 110) || out('bbq', 60, 420)
    if (brief.outdoor.includes('green')) { out('tree-olive', -400, 430); if (some) { out('shrub', 90, 520); out('shrub', 200, 540); out('planter', 340, 520) } if (full) { out('tree-cypress', 440, 540); out('hedge', -150, 580) } }
    if (!brief.outdoor.includes('dining') && !brief.outdoor.includes('lounge') && some) out('garden-sofa', -120, 300, 2)
  }
  void kidRooms
  design = { ...design, finishes, edits: Object.fromEntries(edits) as Design['edits'], ...(brief.note ? { note: brief.note } : {}) }
  return design
}
