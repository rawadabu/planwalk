import type { Item } from '@planwalk/house'
import type { PlanRoom, PlanOpening } from './sheet'
import type { Box } from './labels'
import type { Poly } from './plan'
import type { Stroke } from './stairs'

/**
 * What stands in the rooms of a CAD plan. In a drawing every piece of furniture is a block placed once, so each one is
 * known exactly: where it is, how big, often what it is called. A block's name decides what it is where the name says
 * so (chair, sink, kior, oven, mkrr …); anonymous blocks are told by their size and the room they stand in.
 * Kitchen fixtures against a wall become a run of cabinets as long as the worktop drawn there.
 */
type NoF<T> = T extends unknown ? Omit<T, 'f'> : never
export type CadThing = NoF<Item>
export interface Instance { name: string; layer: string; box: Box; curved: number; parts: number }

type Kind = 'lounge' | 'stool' | 'tv' | 'chair' | 'sofa' | 'armchair' | 'bed' | 'hob' | 'sink' | 'fridge' | 'washer' | 'toilet' | 'bath' | 'table' | 'lowtable' | 'dining' | 'plant'
const NAMES: Array<[RegExp, Kind]> = [
  [/chair|kise|כסא|כיסא/i, 'chair'], [/sofa|sapa|ספה/i, 'sofa'], [/bed|mita|מיטה/i, 'bed'], [/oven|hob|kira|כיריים/i, 'hob'], [/sink|kior|כיור/i, 'sink'],
  [/mkrr|mekar|fridge|refrig|מקרר/i, 'fridge'], [/kvisa|wash|כביסה/i, 'washer'], [/wc|asla|toilet|אסלה/i, 'toilet'], [/bath|ambat|אמבט/i, 'bath'], [/table|shulhan|שולחן/i, 'table'], [/tree|plant|עץ|צמח/i, 'plant'],
]
const WET = /מקלחת|שירותים|אמבט|רחצה/, BED = /שינה|ילדים|הורים|יחידת/, SEAT = /סלון|ישיבה|משפחה|מגורים/
const R = (b: number[]): [number, number, number, number] => [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])]
const facing = (dx: number, dy: number) => Math.atan2(dx, dy)           // model yaw whose front looks along (dx, dy)

export function cadThings(insts: Instance[], rooms: PlanRoom[], walls: Poly[], openings: PlanOpening[], strokes: Stroke[]): CadThing[] {
  const out: CadThing[] = []
  const wall = (x: number, y: number) => walls.some(p => x >= p[0][0] && x <= p[2][0] && y >= p[0][1] && y <= p[2][1]) || openings.some(o => o.kind !== 'door' && x >= o.rect[0] && x <= o.rect[2] && y >= o.rect[1] && y <= o.rect[3])
  const roomAt = (x: number, y: number) => rooms.find(r => r.tiles.some(t => x >= t[0] && x < t[2] && y >= t[1] && y < t[3]))
  const toWall = (x: number, y: number, dx: number, dy: number, max: number) => { for (let t = 1; t <= max; t += 2) if (wall(x + dx * t, y + dy * t)) return t; return Infinity }
  const model = (name: string, b: Box, h: number, rot: number, uniform = false) => out.push({ k: 'model', name, r: R(b), h, rot, ...(uniform ? { uniform: true } : {}) })
  /** the side of a box with a wall close behind it, along x or y: -1, +1, or 0 when it stands free */
  const backOf = (b: Box, ax: 'x' | 'y', reach = 40) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, neg = ax === 'x' ? toWall(b[0], cy, -1, 0, reach) : toWall(cx, b[1], 0, -1, reach), pos = ax === 'x' ? toWall(b[2], cy, 1, 0, reach) : toWall(cx, b[3], 0, 1, reach); return !Number.isFinite(neg) && !Number.isFinite(pos) ? 0 : neg <= pos ? -1 : 1 }

  const seen: Array<{ kind: Kind; b: Box; room: PlanRoom }> = []
  for (const it of insts) {
    const b = it.box, w = b[2] - b[0], d = b[3] - b[1], s = Math.min(w, d), l = Math.max(w, d), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    if (s < 6 || l > 360) continue
    const room = roomAt(cx, cy); if (!room || room.void || room.outdoor) continue
    const wet = WET.test(room.name)
    let kind = NAMES.find(([re]) => re.test(it.name))?.[1]
    if (kind === 'chair' && s >= 62) kind = 'armchair'                   // an easy chair, whatever the block is called
    if (!kind) {
      if (wet) kind = s >= 60 && s <= 95 && l >= 140 && l <= 195 ? 'bath' : s >= 30 && s <= 75 && l >= 52 && l <= 95 && (it.curved > 0 || s <= 50) ? 'toilet' : s >= 35 && s <= 65 && l >= 40 && l <= 140 ? 'sink' : undefined
      else if (s < 14) kind = l >= 80 && l <= 220 ? 'tv' : undefined      // a line of a thing on the wall: the television
      else if (s < 20) kind = undefined
      else if (l >= 183 && l <= 222 && ((s >= 75 && s <= 130) || (s >= 135 && s <= 210))) kind = 'bed'
      else if (/מטבח/.test(room.name)) kind = s >= 150 && l <= 1.4 * s ? 'dining' : s >= 34 && l <= 60 ? 'stool' : undefined
      else if (SEAT.test(room.name) && s >= 150 && l >= 200) kind = 'lounge'
      else if (s >= 150 && l <= 290 && l <= 1.4 * s) kind = 'dining'
      else if (s >= 60 && s <= 118 && l >= 140 && l <= 345) kind = 'sofa'
      else if (s >= 55 && s <= 112 && l <= 128 && it.parts <= 14) kind = it.curved > 0 || it.parts >= 6 ? 'armchair' : 'lowtable'
      else if (s >= 35 && s <= 112 && l >= 60 && l <= 170 && it.parts <= 14) kind = 'lowtable'
    }
    if (kind && kind !== 'plant') seen.push({ kind, b, room })
  }

  const kitchen: Array<{ kind: 'hob' | 'sink' | 'fridge'; b: Box; room: PlanRoom }> = []
  for (const { kind, b, room } of seen) {
    const w = b[2] - b[0], d = b[3] - b[1], s = Math.min(w, d), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, alongX = w >= d
    const toCentre = (ax: 'x' | 'y') => ((ax === 'x' ? (room.rect[0] + room.rect[2]) / 2 - cx : (room.rect[1] + room.rect[3]) / 2 - cy) >= 0 ? 1 : -1)
    const wet = WET.test(room.name)
    if (kind === 'bed') {
      // the head is at a wall: at one end of the bed's length, or (a bed drawn almost square) whichever side has the wall
      const sides = ([['x', -1, toWall(b[0], cy, -1, 0, 45)], ['x', 1, toWall(b[2], cy, 1, 0, 45)], ['y', -1, toWall(cx, b[1], 0, -1, 45)], ['y', 1, toWall(cx, b[3], 0, 1, 45)]] as Array<['x' | 'y', number, number]>)
        .filter(o => Math.abs(w - d) <= 30 || o[0] === (alongX ? 'x' : 'y')).sort((p, q) => p[2] - q[2])[0]
      model(s >= 135 ? 'bedDouble' : 'bedSingle', b, s >= 135 ? 1 : .9, sides[0] === 'x' ? facing(-sides[1], 0) : facing(0, -sides[1]))   // feet point away from that wall
    } else if (kind === 'sofa') {
      const back = backOf(b, alongX ? 'y' : 'x', 60), front = back ? -back : toCentre(alongX ? 'y' : 'x')
      model('sofa', b, .78, alongX ? facing(0, front) : facing(front, 0))
    } else if (kind === 'lounge') {
      // a seating group drawn as one block: a sofa along its long side and one along its short side, each on the side
      // with a wall behind it, and a low table between them
      const D = 92, near = (ax: 'x' | 'y') => { const neg = ax === 'x' ? toWall(b[0], cy, -1, 0, 90) : toWall(cx, b[1], 0, -1, 90), pos = ax === 'x' ? toWall(b[2], cy, 1, 0, 90) : toWall(cx, b[3], 0, 1, 90); return !Number.isFinite(neg) && !Number.isFinite(pos) ? -toCentre(ax) : neg <= pos ? -1 : 1 }
      const sy = near('y'), sx = near('x')
      const stripY: Box = [b[0], sy < 0 ? b[1] : b[3] - D, b[2], sy < 0 ? b[1] + D : b[3]], stripX: Box = [sx < 0 ? b[0] : b[2] - D, b[1], sx < 0 ? b[0] + D : b[2], b[3]]
      if (alongX) { stripX[1] = sy < 0 ? b[1] + D : b[1]; stripX[3] = sy < 0 ? b[3] : b[3] - D } else { stripY[0] = sx < 0 ? b[0] + D : b[0]; stripY[2] = sx < 0 ? b[2] : b[2] - D }
      if (stripY[2] - stripY[0] >= 120) model('sofa', stripY, .78, facing(0, -sy))
      if (stripX[3] - stripX[1] >= 120) model('sofa', stripX, .78, facing(-sx, 0))
      const ix = sx < 0 ? (b[0] + D + b[2]) / 2 : (b[0] + b[2] - D) / 2, iy = sy < 0 ? (b[1] + D + b[3]) / 2 : (b[1] + b[3] - D) / 2
      model('coffeeTable', alongX ? [ix - 50, iy - 28, ix + 50, iy + 28] : [ix - 28, iy - 50, ix + 28, iy + 50], .38, alongX ? 0 : Math.PI / 2)
    } else if (kind === 'tv') {
      out.push({ k: 'box', layer: 'int', r: R(alongX ? [b[0], cy - 3, b[2], cy + 3] : [cx - 3, b[1], cx + 3, b[3]]), y: [.95, 1.65], m: 'blackGlass', rad: .01 })
    } else if (kind === 'stool') {
      const hob = seen.filter(o => o.kind === 'hob' || o.kind === 'sink').map(o => ({ x: (o.b[0] + o.b[2]) / 2, y: (o.b[1] + o.b[3]) / 2 })).map(p => ({ ...p, d: Math.hypot(p.x - cx, p.y - cy) })).sort((p, q) => p.d - q.d)[0]
      const dx = hob ? hob.x - cx : 0, dy = hob ? hob.y - cy : 1
      model('diningChair', b, .86, Math.abs(dx) >= Math.abs(dy) ? facing(Math.sign(dx), 0) : facing(0, Math.sign(dy)), true)
    } else if (kind === 'armchair') {
      const ax = Math.abs((room.rect[0] + room.rect[2]) / 2 - cx) >= Math.abs((room.rect[1] + room.rect[3]) / 2 - cy) ? 'x' as const : 'y' as const
      model('armchair', b, .82, ax === 'x' ? facing(toCentre('x'), 0) : facing(0, toCentre('y')), true)
    } else if (kind === 'lowtable' || kind === 'table') {
      if (BED.test(room.name)) { if (s <= 65) model('nightstand', b, .5, 0, true) }
      else if (!wet) model('coffeeTable', b, .38, alongX ? 0 : Math.PI / 2)
    } else if (kind === 'dining') {
      // a table drawn with its chairs: the table in the middle, the chairs around it facing in
      const T = Math.max(90, s - 96), n = s >= 200 ? 6 : 4, ring = T / 2 + 24
      model('roundTable', [cx - T / 2, cy - T / 2, cx + T / 2, cy + T / 2], .75, 0, true)
      for (let i = 0; i < n; i++) { const a = Math.PI * 2 * (i + .5) / n, px = cx + Math.cos(a) * ring, py = cy + Math.sin(a) * ring; model('diningChair', [px - 22, py - 20, px + 22, py + 20], .86, facing(cx - px, cy - py), true) }
    } else if (kind === 'chair') {
      const table = seen.filter(o => o.kind === 'dining' || o.kind === 'table').map(o => ({ x: (o.b[0] + o.b[2]) / 2, y: (o.b[1] + o.b[3]) / 2 })).map(p => ({ ...p, d: Math.hypot(p.x - cx, p.y - cy) })).sort((p, q) => p.d - q.d)[0]
      const [tx, ty] = table && table.d < 140 ? [table.x, table.y] : [(room.rect[0] + room.rect[2]) / 2, (room.rect[1] + room.rect[3]) / 2]
      model('diningChair', b, .86, facing(tx - cx, ty - cy), true)
    } else if (kind === 'toilet') {
      // the bowl stands against the wall at one end of what is drawn (the symbol may include the cistern and clearances)
      const back = backOf(b, alongX ? 'x' : 'y') || -1, W = 40, L = Math.min(68, Math.max(w, d))
      const bowl: Box = alongX ? [back < 0 ? b[0] : b[2] - L, cy - W / 2, back < 0 ? b[0] + L : b[2], cy + W / 2] : [cx - W / 2, back < 0 ? b[1] : b[3] - L, cx + W / 2, back < 0 ? b[1] + L : b[3]]
      model('toilet', bowl, 1, alongX ? facing(-back, 0) : facing(0, -back), true)
    } else if (kind === 'bath') model('bathtub', b, .56, alongX ? 0 : Math.PI / 2)
    else if (kind === 'washer') out.push({ k: 'box', layer: 'int', r: R(b), y: [0, .85], m: 'ceil', rad: .02 })
    else if (kind === 'sink' && wet) {
      const ax = alongX ? 'y' as const : 'x' as const, back = backOf(b, ax) || backOf(b, alongX ? 'x' : 'y') || -1
      model('vanity', b, .55, ax === 'x' ? facing(-back, 0) : facing(0, -back))
    } else if (kind === 'hob' || kind === 'sink' || kind === 'fridge') { if (!wet) kitchen.push({ kind, b, room }) }
  }

  // ── kitchens: fixtures against a wall are modules of a run; the run is as long as the worktop edge drawn 60 cm out ──
  type Seg = { o: 'h' | 'v'; at: number; lo: number; hi: number }
  const segs: Seg[] = []
  for (const st of strokes) if (!st.curved && !st.dashed) for (let i = 0; i + 1 < st.pts.length + (st.closed ? 1 : 0); i++) {
    const a = st.pts[i], b = st.pts[(i + 1) % st.pts.length], dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1])
    if (dy < 1 && dx >= 25) segs.push({ o: 'h', at: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) })
    else if (dx < 1 && dy >= 25) segs.push({ o: 'v', at: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) })
  }
  const runs = new Map<string, { axis: 'x' | 'y'; back: number; sign: number; room: PlanRoom; fx: typeof kitchen }>()
  const islands: typeof kitchen = []
  for (const f of kitchen) {
    const cx = (f.b[0] + f.b[2]) / 2, cy = (f.b[1] + f.b[3]) / 2
    const opts = ([['y', -1, toWall(cx, f.b[1], 0, -1, 16), f.b[1]], ['y', 1, toWall(cx, f.b[3], 0, 1, 16), f.b[3]], ['x', -1, toWall(f.b[0], cy, -1, 0, 16), f.b[0]], ['x', 1, toWall(f.b[2], cy, 1, 0, 16), f.b[2]]] as Array<['x' | 'y', number, number, number]>).filter(o => Number.isFinite(o[2])).sort((p, q) => p[2] - q[2])[0]
    if (!opts) { islands.push(f); continue }
    const [across, sign, dist, edge] = opts, back = edge + sign * (dist - 1), axis = across === 'y' ? 'x' as const : 'y' as const      // the run goes along the wall
    const key = `${rooms.indexOf(f.room)}:${axis}:${sign}:${Math.round(back / 12)}`
    const run = runs.get(key) ?? { axis, back, sign, room: f.room, fx: [] }
    run.fx.push(f); runs.set(key, run)
  }
  for (const run of runs.values()) {
    const a = run.axis === 'x' ? 0 : 1, front = run.back - run.sign * 60
    let lo = Math.min(...run.fx.map(f => f.b[a])), hi = Math.max(...run.fx.map(f => f.b[a + 2]))
    // the worktop's front edge, wherever it continues the run
    const edges = segs.filter(s => s.o === (run.axis === 'x' ? 'h' : 'v') && Math.abs(s.at - front) <= 9)
    for (let grew = true; grew;) { grew = false; for (const e of edges) if (e.lo <= hi + 12 && e.hi >= lo - 12 && (e.lo < lo - 1 || e.hi > hi + 1)) { lo = Math.min(lo, e.lo); hi = Math.max(hi, e.hi); grew = true } }
    if (hi - lo > 620) continue                                          // not a worktop: a line that happens to run there
    const rect = (from: number, to: number, depth = 60): Box => { const c1 = Math.min(run.back, run.back - run.sign * depth), c2 = Math.max(run.back, run.back - run.sign * depth); return run.axis === 'x' ? [from, c1, to, c2] : [c1, from, c2, to] }
    const dir = (run.axis === 'x' ? (run.sign < 0 ? 'y+' : 'y-') : (run.sign < 0 ? 'x+' : 'x-')) as 'x+' | 'x-' | 'y+' | 'y-'
    const fx = [...run.fx].sort((p, q) => p.b[a] - q.b[a])
    const mods: Array<{ from: number; to: number; kind: 'drawers' | 'doors' | 'sink' | 'hob' | 'fridge' }> = []
    const fill = (from: number, to: number) => { const len = to - from; if (len < 20) return; const n = Math.max(1, Math.round(len / 60)); for (let i = 0; i < n; i++) mods.push({ from: from + len * i / n, to: from + len * (i + 1) / n, kind: i % 2 ? 'doors' : 'drawers' }) }
    let at = lo
    for (const f of fx) {
      const c = (f.b[a] + f.b[a + 2]) / 2, half = Math.min(45, Math.max(30, (f.b[a + 2] - f.b[a]) / 2)), from = Math.max(at, c - half), to = Math.min(hi, c + half)
      if (to - from < 30) continue
      fill(at, from); mods.push({ from, to, kind: f.kind }); at = to
    }
    fill(at, hi)
    let topFrom: number | null = null
    mods.forEach((m, k) => {
      out.push({ k: 'cabinet', r: R(rect(m.from, m.to)), kind: m.kind, dir, n: k })
      if (m.kind === 'fridge') { if (topFrom !== null) { out.push({ k: 'box', r: R(rect(topFrom, m.from, 62)), y: [.87, .9], m: 'quartz', rad: .003 }); topFrom = null } }
      else if (topFrom === null) topFrom = m.from
    })
    if (topFrom !== null) out.push({ k: 'box', r: R(rect(topFrom, mods[mods.length - 1].to, 62)), y: [.87, .9], m: 'quartz', rad: .003 })
  }
  // a hob or a sink standing free is on an island: the rectangle drawn around it
  const rects: Box[] = []
  for (const st of strokes) { if (st.curved || st.pts.length < 4 || st.pts.length > 5) continue; const xs = st.pts.map(p => p[0]), ys = st.pts.map(p => p[1]), b: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; if (st.pts.every(p => (Math.abs(p[0] - b[0]) < 1 || Math.abs(p[0] - b[2]) < 1) && (Math.abs(p[1] - b[1]) < 1 || Math.abs(p[1] - b[3]) < 1))) rects.push(b) }
  const done: Box[] = []
  for (const f of islands) {
    const cx = (f.b[0] + f.b[2]) / 2, cy = (f.b[1] + f.b[3]) / 2
    if (done.some(b => cx > b[0] && cx < b[2] && cy > b[1] && cy < b[3])) continue
    const b = rects.filter(r => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]).map(r => ({ r, s: Math.min(r[2] - r[0], r[3] - r[1]), l: Math.max(r[2] - r[0], r[3] - r[1]) })).filter(x => x.s >= 60 && x.s <= 135 && x.l >= 110 && x.l <= 345).sort((p, q) => p.s * p.l - q.s * q.l)[0]?.r
    if (!b) continue
    done.push(b)
    model('island', b, .92, b[2] - b[0] >= b[3] - b[1] ? 0 : Math.PI / 2)
  }
  return out
}
