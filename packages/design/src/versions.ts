import type { House } from '@planwalk/house'
import { parseTarget, targetKey, type Design } from './schema'
import { applyEdits, editKey, findPartition, PX_PER_CM, type Edit } from './edits'
import { itemRef, pieceName } from './furnish'

/**
 * Plan versions. When the architect publishes updated plans, two things must happen without a meeting:
 *   planChanges  — say what changed between the two houses, in the client's words, each with a place on the plan
 *   carryDesign  — move the client's own choices (finishes per room, windows, walls, kitchen) onto the new plan,
 *                  and say honestly which ones no longer fit
 */
type Rect = [number, number, number, number]
type F = 0 | 1 | 2
export interface PlanChange {
  kind: 'room' | 'opening' | 'wall'
  storey: F
  where: string
  what: string
  /** plan px on that storey of the NEW plan (the old one for things that were removed) */
  rect: Rect
}
export interface PlanChanges {
  changes: PlanChange[]
  counts: { room: number; opening: number; wall: number }
  /** indoor floor area, m² */
  area: { before: number; after: number }
}

const STOREY = ['קומת קרקע', 'קומה ראשונה', 'קומה שנייה']
const FLOORS: F[] = [0, 1, 2]
const area = (r: Rect) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1])
const m2 = (h: House, r: Rect) => area(r) / (h.source.pxPerMetre * h.source.pxPerMetre)
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const iou = (a: Rect, b: Rect) => { const i = area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]); return i ? i / (area(a) + area(b) - i) : 0 }
const rectOf = (r: House['floors'][0]['rooms'][number]): Rect => [r[2], r[3], r[4], r[5]]
const centre = (r: Rect): [number, number] => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Which room of the new plan each room of the old plan became (by overlap, helped by the name); null = gone. */
export function matchRooms(prev: House, next: House, f: F): Array<number | null> {
  const A = prev.floors[f].rooms, B = next.floors[f].rooms
  const pairs: Array<{ i: number; k: number; s: number }> = []
  A.forEach((a, i) => B.forEach((b, k) => {
    const o = iou(rectOf(a), rectOf(b)), same = a[0] === b[0]
    const onlyA = A.filter(r => r[0] === a[0]).length === 1, onlyB = B.filter(r => r[0] === b[0]).length === 1
    if (o > .25 || (same && o > .02) || (same && onlyA && onlyB)) pairs.push({ i, k, s: o + (same ? .5 : 0) })
  }))
  pairs.sort((p, q) => q.s - p.s)
  const out: Array<number | null> = A.map(() => null), taken = new Set<number>()
  for (const p of pairs) if (out[p.i] == null && !taken.has(p.k)) { out[p.i] = p.k; taken.add(p.k) }
  return out
}

/** Openings of one storey in one list: glazing (windows, glass doors) and door openings. */
type Opening = { door: boolean; r: Rect; sill: number; head: number; index: number }
const openingsOf = (h: House, f: F): Opening[] => [
  ...h.floors[f].glass.map((g, index): Opening => ({ door: false, r: [g[0], g[1], g[2], g[3]], sill: g[4], head: g[5], index })),
  ...h.items.filter(i => i.k === 'opening' && i.f === f).map((i, index): Opening => ({ door: true, r: (i as { r: Rect }).r, sill: 0, head: (i as { head: number }).head, index })),
]
const lengthCm = (r: Rect) => Math.round(Math.max(r[2] - r[0], r[3] - r[1]) / PX_PER_CM)
const horiz = (r: Rect) => r[2] - r[0] >= r[3] - r[1]
function matchOpenings(A: Opening[], B: Opening[]): Array<number | null> {
  const pairs: Array<{ i: number; k: number; d: number }> = []
  A.forEach((a, i) => B.forEach((b, k) => { if (a.door !== b.door || horiz(a.r) !== horiz(b.r)) return; const d = dist(centre(a.r), centre(b.r)); if (d < 70) pairs.push({ i, k, d }) }))
  pairs.sort((p, q) => p.d - q.d)
  const out: Array<number | null> = A.map(() => null), taken = new Set<number>()
  for (const p of pairs) if (out[p.i] == null && !taken.has(p.k)) { out[p.i] = p.k; taken.add(p.k) }
  return out
}
// room boxes can overlap (an L-shaped room, the garden around the house): indoors first, and the smallest box at the point
const roomAt = (h: House, f: F, x: number, y: number, indoorOnly = false) => {
  const fl = h.floors[f], hit = (list: typeof fl.rooms) => list.filter(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5]).sort((a, b) => area(rectOf(a)) - area(rectOf(b)))[0]?.[0] ?? null
  return hit(fl.rooms.slice(0, fl.indoor)) ?? (indoorOnly ? null : hit(fl.rooms.slice(fl.indoor)))
}
const roomNear = (h: House, f: F, r: Rect) => { const [x, y] = centre(r); for (const indoor of [true, false]) for (const d of [0, 30, 60, 100]) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) { const n = roomAt(h, f, x + dx, y + dy, indoor); if (n) return n } return null }

/** Wall mass on a coarse grid, for "a wall was added / removed here". */
const CELL = 8
function wallCells(h: House, f: F, box: Rect) {
  const w = Math.ceil((box[2] - box[0]) / CELL), hh = Math.ceil((box[3] - box[1]) / CELL), g = new Uint8Array(Math.max(1, w * hh))
  for (const p of h.floors[f].walls) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const [x, y] of p) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y) }
    for (let gy = Math.max(0, Math.floor((y1 - box[1]) / CELL)); gy < Math.min(hh, Math.ceil((y2 - box[1]) / CELL)); gy++) for (let gx = Math.max(0, Math.floor((x1 - box[0]) / CELL)); gx < Math.min(w, Math.ceil((x2 - box[0]) / CELL)); gx++) {
      const x = box[0] + (gx + .5) * CELL, y = box[1] + (gy + .5) * CELL
      let inside = false
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside
      if (inside) g[gy * w + gx] = 1
    }
  }
  return { g, w, h: hh }
}
/** Connected groups of cells that are wall in `a` and nowhere near a wall in `b`. */
function onlyIn(a: Uint8Array, b: Uint8Array, w: number, h: number, box: Rect): Rect[] {
  const near = (gx: number, gy: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = gx + dx, y = gy + dy; if (x >= 0 && y >= 0 && x < w && y < h && b[y * w + x]) return true } return false }
  const diff = new Uint8Array(w * h)
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) if (a[gy * w + gx] && !near(gx, gy)) diff[gy * w + gx] = 1
  const out: Rect[] = []
  for (let s = 0; s < diff.length; s++) {
    if (!diff[s]) continue
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, n = 0
    const stack = [s]; diff[s] = 0
    while (stack.length) {
      const c = stack.pop()!, cx = c % w, cy = (c - cx) / w; n++
      x1 = Math.min(x1, cx); y1 = Math.min(y1, cy); x2 = Math.max(x2, cx); y2 = Math.max(y2, cy)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h && diff[y * w + x]) { diff[y * w + x] = 0; stack.push(y * w + x) } }
    }
    if (Math.max(x2 - x1, y2 - y1) + 1 >= 5) out.push([box[0] + x1 * CELL, box[1] + y1 * CELL, box[0] + (x2 + 1) * CELL, box[1] + (y2 + 1) * CELL])   // ≥ 40 cm of wall
  }
  return out
}

export function planChanges(prev: House, next: House): PlanChanges {
  const changes: PlanChange[] = []
  let before = 0, after = 0
  for (const f of FLOORS) {
    const A = prev.floors[f], B = next.floors[f], st = STOREY[f]
    A.rooms.slice(0, A.indoor).forEach(r => { before += m2(prev, rectOf(r)) }); B.rooms.slice(0, B.indoor).forEach(r => { after += m2(next, rectOf(r)) })
    // rooms
    const map = matchRooms(prev, next, f), kept = new Set(map.filter((k): k is number => k != null))
    A.rooms.forEach((a, i) => {
      const k = map[i]
      if (k == null) { changes.push({ kind: 'room', storey: f, where: `${a[0]} · ${st}`, what: `החדר הוסר מהתוכנית (היה ${fmt(m2(prev, rectOf(a)))} מ"ר)`, rect: rectOf(a) }); return }
      const b = B.rooms[k], ra = rectOf(a), rb = rectOf(b), sa = m2(prev, ra), sb = m2(next, rb), parts: string[] = []
      if (a[0] !== b[0]) parts.push(`שם חדש: ${b[0]} (היה ${a[0]})`)
      if (Math.abs(sb - sa) >= .3 && Math.abs(sb - sa) / Math.max(sa, .1) >= .03) parts.push(`${sb > sa ? 'גדל' : 'קטן'} מ-${fmt(sa)} ל-${fmt(sb)} מ"ר (${a[1]} ← ${b[1]})`)
      else if (dist(centre(ra), centre(rb)) > 35 * PX_PER_CM) parts.push(`הוזז ${Math.round(dist(centre(ra), centre(rb)) / PX_PER_CM)} ס"מ`)
      if (parts.length) changes.push({ kind: 'room', storey: f, where: `${b[0]} · ${st}`, what: parts.join(' · '), rect: rb })
    })
    B.rooms.forEach((b, k) => { if (!kept.has(k)) changes.push({ kind: 'room', storey: f, where: `${b[0]} · ${st}`, what: `חדר חדש, ${fmt(m2(next, rectOf(b)))} מ"ר (${b[1]})`, rect: rectOf(b) }) })
    // windows and doors
    const OA = openingsOf(prev, f), OB = openingsOf(next, f), om = matchOpenings(OA, OB), okept = new Set(om.filter((k): k is number => k != null))
    const word = (o: Opening) => (o.door ? 'דלת' : o.sill < .15 ? 'דלת זכוכית' : 'חלון')
    OA.forEach((a, i) => {
      const k = om[i]
      if (k == null) { changes.push({ kind: 'opening', storey: f, where: `${roomNear(prev, f, a.r) ?? st} · ${st}`, what: `${word(a)} ברוחב ${lengthCm(a.r)} ס"מ ${a.door ? 'הוסרה' : word(a) === 'חלון' ? 'הוסר' : 'הוסרה'}`, rect: a.r }); return }
      const b = OB[k], parts: string[] = []
      if (word(a) !== word(b)) parts.push(`${word(a)} הפך ל${word(b)}`)
      if (Math.abs(lengthCm(a.r) - lengthCm(b.r)) >= 10) parts.push(`רוחב ${lengthCm(a.r)} ← ${lengthCm(b.r)} ס"מ`)
      else if (dist(centre(a.r), centre(b.r)) > 20 * PX_PER_CM) parts.push(`הוזז ${Math.round(dist(centre(a.r), centre(b.r)) / PX_PER_CM)} ס"מ`)
      if (!a.door && word(a) === word(b) && Math.abs(a.sill - b.sill) >= .1) parts.push(`אדן ${Math.round(a.sill * 100)} ← ${Math.round(b.sill * 100)} ס"מ`)
      if (parts.length) changes.push({ kind: 'opening', storey: f, where: `${roomNear(next, f, b.r) ?? st} · ${st}`, what: `${word(b)}: ${parts.join(', ')}`, rect: b.r })
    })
    OB.forEach((b, k) => { if (!okept.has(k)) changes.push({ kind: 'opening', storey: f, where: `${roomNear(next, f, b.r) ?? st} · ${st}`, what: `${word(b)} ${b.door || word(b) !== 'חלון' ? 'חדשה' : 'חדש'} ברוחב ${lengthCm(b.r)} ס"מ`, rect: b.r }) })
    // walls
    if (A.walls.length && B.walls.length) {
      const box: Rect = [Math.min(A.bounds[0], B.bounds[0]) - 40, Math.min(A.bounds[1], B.bounds[1]) - 40, Math.max(A.bounds[2], B.bounds[2]) + 40, Math.max(A.bounds[3], B.bounds[3]) + 40]
      const ga = wallCells(prev, f, box), gb = wallCells(next, f, box)
      // an opening that closed or opened is already reported as a window/door change
      const atOpening = (r: Rect, list: Opening[]) => list.some(o => r[0] >= o.r[0] - 16 && r[2] <= o.r[2] + 16 && r[1] >= o.r[1] - 16 && r[3] <= o.r[3] + 16)
      const added = onlyIn(gb.g, ga.g, ga.w, ga.h, box).filter(r => !atOpening(r, OA)), removed = onlyIn(ga.g, gb.g, ga.w, ga.h, box).filter(r => !atOpening(r, OB))
      // a wall that went and a parallel one that appeared beside it are one wall that moved
      const gone = new Set<number>()
      for (const r of added) {
        const hz = horiz(r), lo = hz ? 0 : 1, hi = hz ? 2 : 3, across = hz ? 1 : 0
        const k = removed.findIndex((o, i) => !gone.has(i) && horiz(o) === hz && Math.min(r[hi], o[hi]) - Math.max(r[lo], o[lo]) > .6 * Math.min(r[hi] - r[lo], o[hi] - o[lo]) && Math.abs((r[across] + r[across + 2]) / 2 - (o[across] + o[across + 2]) / 2) < 220)
        const where = `${roomNear(next, f, r) ?? st} · ${st}`
        if (k < 0) { changes.push({ kind: 'wall', storey: f, where, what: `קיר חדש, כ-${lengthCm(r)} ס"מ`, rect: r }); continue }
        gone.add(k)
        const o = removed[k]
        // measured on the drawn faces of the wall (its long edges), not on the grid
        const faces = (h: House, q: Rect) => {
          const out: number[] = [], need = .5 * (q[hi] - q[lo])
          for (const p of h.floors[f].walls) for (let n = 0; n < p.length; n++) {
            const a = p[n], b = p[(n + 1) % p.length]
            if (Math.abs(a[across] - b[across]) > .5 || a[across] < q[across] - CELL || a[across] > q[across + 2] + CELL) continue
            const along = hz ? 0 : 1, e1 = Math.min(a[along], b[along]), e2 = Math.max(a[along], b[along])
            if (Math.min(e2, q[hi]) - Math.max(e1, q[lo]) >= need) out.push(a[across])
          }
          return out.length ? out.reduce((x, y) => x + y, 0) / out.length : (q[across] + q[across + 2]) / 2
        }
        const by = Math.abs(faces(next, r) - faces(prev, o)) / PX_PER_CM
        changes.push({ kind: 'wall', storey: f, where, what: `קיר הוזז כ-${Math.round(by / 5) * 5} ס"מ`, rect: r })
      }
      removed.forEach((r, i) => { if (!gone.has(i)) changes.push({ kind: 'wall', storey: f, where: `${roomNear(next, f, r) ?? roomNear(prev, f, r) ?? st} · ${st}`, what: `קיר הוסר, כ-${lengthCm(r)} ס"מ`, rect: r }) })
    }
  }
  const order = { room: 0, wall: 1, opening: 2 } as const
  changes.sort((a, b) => b.storey - a.storey || order[a.kind] - order[b.kind])
  const n = (k: PlanChange['kind']) => changes.filter(c => c.kind === k).length
  return { changes, counts: { room: n('room'), opening: n('opening'), wall: n('wall') }, area: { before: Math.round(before * 10) / 10, after: Math.round(after * 10) / 10 } }
}

export interface Carried { design: Design; kept: number; dropped: Array<{ key: string; what: string }> }

/** A client's design moved from the old plan to the new one. Nothing is silently lost: what no longer fits is listed. */
export function carryDesign(prev: House, next: House, design: Design): Carried {
  const dropped: Carried['dropped'] = [], finishes: Design['finishes'] = {}, edits: Record<string, Edit> = {}
  const rooms = { 0: matchRooms(prev, next, 0), 1: matchRooms(prev, next, 1), 2: matchRooms(prev, next, 2) }
  for (const [key, id] of Object.entries(design.finishes ?? {})) {
    const t = parseTarget(key); if (!t) continue
    if (t.floor === undefined || t.room === undefined) { finishes[key] = id; continue }
    const k = rooms[t.floor][t.room], name = prev.floors[t.floor].rooms[t.room]?.[0] ?? 'חדר'
    if (k == null) dropped.push({ key, what: `הבחירה שלכם ב${name} (${STOREY[t.floor]}): החדר כבר לא קיים בתוכנית החדשה` })
    else finishes[targetKey(t.part, { floor: t.floor, room: k })] = id
  }
  for (const [key, e] of Object.entries((design.edits ?? {}) as Record<string, Edit>)) {
    if (e.k === 'window') {
      const A = openingsOf(prev, e.floor).filter(o => !o.door), B = openingsOf(next, e.floor).filter(o => !o.door)
      const k = matchOpenings(A, B)[e.index]
      if (k == null) dropped.push({ key, what: `שינוי החלון שלכם ב${STOREY[e.floor]}: החלון השתנה או הוסר בתוכנית החדשה` })
      else { const n = { ...e, index: B[k].index }; edits[editKey(n)] = n }
    } else if (e.k === 'wall') {
      const p = findPartition(next, e.floor, e.axis, e.a, (e.lo + e.hi) / 2)
      if (p.ok && Math.abs(p.wall.a - e.a) < 4 && Math.abs(p.wall.b - e.b) < 4) { const n = { ...e, a: p.wall.a, b: p.wall.b, lo: p.wall.lo, hi: p.wall.hi }; edits[editKey(n)] = n }
      else dropped.push({ key, what: `הקיר שהזזתם ב${STOREY[e.floor]}: הקיר השתנה בתוכנית החדשה` })
    } else if (e.k === 'item') {
      // the same piece in the new plan: same model, standing (almost) where it stood
      const [name, sx, sy] = [e.ref.replace(/-(-?\d+)-(-?\d+)$/, ''), ...(/-(-?\d+)-(-?\d+)$/.exec(e.ref)?.slice(1).map(Number) ?? [NaN, NaN])] as [string, number, number]
      const cands = next.items.filter(i => i.k === 'model' && i.f === e.floor && i.name === name).map(i => { const m = i as Extract<typeof i, { k: 'model' }>; return { m, d: Math.hypot((m.r[0] + m.r[2]) / 2 - sx, (m.r[1] + m.r[3]) / 2 - sy) } }).sort((p, q) => p.d - q.d)
      if (cands[0] && cands[0].d < 45) { const n = { ...e, ref: itemRef(cands[0].m) }; edits[editKey(n)] = n }
      else dropped.push({ key, what: `${pieceName(name)} ב${STOREY[e.floor]}: הרהיט כבר לא נמצא שם בתוכנית החדשה` })
    } else if (e.k === 'add') {
      edits[key] = e                                                     // what the client brought in stays where they put it
    } else {
      const len = e.length * PX_PER_CM, x = e.axis === 'x' ? e.x + len / 2 : e.x, y = e.axis === 'x' ? e.y : e.y + len / 2
      const was = roomAt(prev, e.floor, x, y, true), now = [0, 25, -25].flatMap(d => [roomAt(next, e.floor, x + d, y, true), roomAt(next, e.floor, x, y + d, true)]).find(Boolean)
      if (now && (!was || was === now || rooms[e.floor].some((k, i) => k != null && prev.floors[e.floor].rooms[i][0] === was && next.floors[e.floor].rooms[k][0] === now))) edits[key] = e
      else dropped.push({ key, what: `המטבח שתכננתם ב${STOREY[e.floor]}: החדר השתנה בתוכנית החדשה` })
    }
  }
  // whatever the new plan refuses outright does not travel either
  for (const i of applyEdits(next, edits).issues) if (i.level === 'error' && edits[i.key]) {
    const e = edits[i.key]; delete edits[i.key]
    dropped.push({ key: i.key, what: `${e.k === 'window' ? 'שינוי החלון' : e.k === 'wall' ? 'הקיר שהזזתם' : e.k === 'run' ? 'המטבח שתכננתם' : 'רהיט שהזזתם'} ב${STOREY[e.floor]}: לא מתאים לתוכנית החדשה` })
  }
  return { design: { ...design, finishes, edits: edits as Design['edits'] }, kept: Object.keys(finishes).length + Object.keys(edits).length, dropped }
}
