import type { Item } from '@planwalk/house'
import type { PlanStorey, PlanRoom } from './sheet'
import type { Box } from './labels'
import { Grid, close, components } from './raster'

/**
 * What stands in the rooms, from what the architect drew and wrote: kitchen runs module by module from their labels,
 * beds and wardrobes from theirs, drawn furniture and sanitary ware by shape, paved outdoor floors from the hatch,
 * and ceiling lights. Everything is a house@1 item (without its storey; the caller adds `f`).
 */
type NoF<T> = T extends unknown ? Omit<T, 'f'> : never
export type Thing = NoF<Item>
const R = (b: number[]): [number, number, number, number] => [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])]

const WET = /מקלחת|שירותים|אמבט|רחצה/, BED = /שינה|ילדים|הורים|יחידת/, SEAT = /סלון|ישיבה|משפחה|מגורים/, KITCHEN = /מטבח/
const CABINET: Array<[RegExp, 'drawers' | 'doors' | 'sink' | 'hob' | 'dishwasher' | 'corner' | 'fridge' | 'oven' | 'pantry']> = [
  [/מגירות/, 'drawers'], [/מקרר/, 'fridge'], [/כיור/, 'sink'], [/מדיח/, 'dishwasher'], [/מזווה|פלדינג/, 'pantry'], [/מאגיק|פינ/, 'corner'], [/כיריים/, 'hob'], [/תנור|מיקרו/, 'oven'], [/תריס|^ארון$/, 'doors'],
]
const TALL = new Set(['fridge', 'pantry', 'oven'])

export function furnish(st: PlanStorey): Thing[] {
  const out: Thing[] = []
  const inPoly = (p: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
  // a window or glass door is as good as a wall to stand a cabinet or a bed against
  const wall = (x: number, y: number) => st.walls.some(p => inPoly(p, x, y)) || st.openings.some(o => o.kind !== 'door' && x >= o.rect[0] && x <= o.rect[2] && y >= o.rect[1] && y <= o.rect[3])
  const roomAt = (x: number, y: number): PlanRoom | undefined => st.rooms.find(r => r.tiles.some(t => x >= t[0] && x < t[2] && y >= t[1] && y < t[3]))
  /** distance from (x, y) to the first wall along (dx, dy), up to `max`; Infinity if none */
  const toWall = (x: number, y: number, dx: number, dy: number, max: number) => { for (let t = 2; t <= max; t += 2) if (wall(x + dx * t, y + dy * t)) return t; return Infinity }
  const facing = (dx: number, dy: number) => Math.atan2(dx, dy)          // model yaw whose front looks along (dx, dy)

  // ── kitchen: every label is one module ────────────────────────────────────────────────────────────────────────
  const kinds = st.notes.map(n => ({ n, kind: CABINET.find(([re]) => re.test(n.text))?.[1] })).filter(k => k.kind && KITCHEN.test(roomAt(k.n.at[0], k.n.at[1])?.name ?? '')) as Array<{ n: PlanStorey['notes'][number]; kind: NonNullable<ReturnType<typeof CABINET.find>>[1] }>
  const taken = new Set<number>()
  const runs: Array<{ axis: 'x' | 'y'; ids: number[] }> = []
  for (const axis of ['x', 'y'] as const) {
    const a = axis === 'x' ? 0 : 1, c = 1 - a
    const ids = kinds.map((_, i) => i).sort((p, q) => kinds[p].n.at[c] - kinds[q].n.at[c] || kinds[p].n.at[a] - kinds[q].n.at[a])
    let cur: number[] = []
    const flush = () => { if (cur.length >= 2) runs.push({ axis, ids: cur }); cur = [] }
    for (const i of ids) {
      const last = cur[cur.length - 1]
      if (last !== undefined && (Math.abs(kinds[i].n.at[c] - kinds[cur[0]].n.at[c]) > 22 || kinds[i].n.at[a] - kinds[last].n.at[a] > 190)) flush()
      cur.push(i)
    }
    flush()
  }
  runs.sort((p, q) => q.ids.length - p.ids.length)
  for (const run of runs) {
    const ids = run.ids.filter(i => !taken.has(i)); if (ids.length < 2) continue
    const a = run.axis === 'x' ? 0 : 1, c = 1 - a
    ids.sort((p, q) => kinds[p].n.at[a] - kinds[q].n.at[a])
    const across = ids.map(i => kinds[i].n.at[c]).sort((p, q) => p - q)[Math.floor(ids.length / 2)]
    // the back is the side with a wall close behind (seen from any module of the run)
    const probe = (sign: number) => Math.min(...ids.map(i => (run.axis === 'x' ? toWall(kinds[i].n.at[0], across, 0, sign, 60) : toWall(across, kinds[i].n.at[1], sign, 0, 60))))
    const neg = probe(-1), pos = probe(1)
    if (!Number.isFinite(neg) && !Number.isFinite(pos)) continue          // free-standing: the island is taken from its drawn shape
    const backSign = neg <= pos ? -1 : 1, back = across + backSign * Math.min(neg, pos), front = back - backSign * 60
    const dir = (run.axis === 'x' ? (backSign < 0 ? 'y+' : 'y-') : (backSign < 0 ? 'x+' : 'x-')) as 'x+' | 'x-' | 'y+' | 'y-'
    const pos1 = ids.map(i => kinds[i].n.at[a])
    const edge = (i: number) => (pos1[i] + pos1[i + 1]) / 2
    const cuts = [pos1[0] - Math.min(45, (pos1[1] - pos1[0]) / 2), ...pos1.slice(0, -1).map((_, i) => edge(i)), pos1[pos1.length - 1] + Math.min(45, (pos1[pos1.length - 1] - pos1[pos1.length - 2]) / 2)]
    const rect = (from: number, to: number, depth = 60): Box => { const c1 = Math.min(back, back - backSign * depth), c2 = Math.max(back, back - backSign * depth); return run.axis === 'x' ? [from, c1, to, c2] : [c1, from, c2, to] }
    let topFrom: number | null = null
    ids.forEach((i, k) => {
      taken.add(i)
      const kind = kinds[i].kind
      out.push({ k: 'cabinet', r: R(rect(cuts[k], cuts[k + 1])), kind, dir, n: k })
      if (TALL.has(kind)) { if (topFrom !== null) { out.push({ k: 'box', r: R(rect(topFrom, cuts[k], 62)), y: [.87, .9], m: 'quartz', rad: .003 }); topFrom = null } }
      else if (topFrom === null) topFrom = cuts[k]
    })
    if (topFrom !== null) out.push({ k: 'box', r: R(rect(topFrom, cuts[cuts.length - 1], 62)), y: [.87, .9], m: 'quartz', rad: .003 })
    void front
  }

  // ── wardrobes: "ארון 240" — a tall run that long, against the wall behind the label ────────────────────────────
  for (const n of st.notes) {
    const m = /^ארון(?:\s+(\d{2,3}))?$/.exec(n.text.trim()); if (!m) continue
    if (!m[1] && KITCHEN.test(roomAt(n.at[0], n.at[1])?.name ?? '')) continue          // a kitchen's "ארון" is one of its modules
    const len = Number(m[1] ?? 110) * .99318, alongX = n.box[2] - n.box[0] >= n.box[3] - n.box[1], [x, y] = n.at
    const neg = alongX ? toWall(x, y, 0, -1, 70) : toWall(x, y, -1, 0, 70), pos = alongX ? toWall(x, y, 0, 1, 70) : toWall(x, y, 1, 0, 70)
    const sign = neg <= pos ? -1 : 1, d = Math.min(neg, pos), back = (alongX ? y : x) + (Number.isFinite(d) ? sign * d : sign * 30)
    const c1 = Math.min(back, back - sign * 60), c2 = Math.max(back, back - sign * 60)
    out.push({ k: 'tall', r: R(alongX ? [x - len / 2, c1, x + len / 2, c2] : [c1, y - len / 2, c2, y + len / 2]) })
  }

  // ── a closet room is lined with wardrobes: along each long wall, where the wall is solid (not at a doorway) ───
  for (const r of st.rooms) {
    if (r.outdoor || r.void || !/ארונות/.test(r.name)) continue
    const [x1, y1, x2, y2] = r.rect, alongX = x2 - x1 >= y2 - y1, lo = alongX ? x1 : y1, hi = alongX ? x2 : y2, short = alongX ? y2 - y1 : x2 - x1
    const runs: Array<{ side: number; a: number; b: number }> = []
    for (const side of [-1, 1]) {
      const face = side < 0 ? (alongX ? y1 : x1) : (alongX ? y2 : x2)
      let a = NaN, best: [number, number] | null = null
      for (let p = lo + 5; p <= hi + 5; p += 10) {
        const solid = p < hi && [6, 14].some(t => (alongX ? wall(p, face + side * t) : wall(face + side * t, p)))
        if (solid && Number.isNaN(a)) a = p
        if (!solid && !Number.isNaN(a)) { if (!best || p - a > best[1] - best[0]) best = [a, p]; a = NaN }
      }
      if (best && best[1] - best[0] >= 100) runs.push({ side, a: best[0], b: best[1] - 5 })
    }
    // two rows need room to stand between them
    const use = short >= 175 ? runs : runs.sort((p, q) => (q.b - q.a) - (p.b - p.a)).slice(0, 1)
    for (const u of use) {
      const face = u.side < 0 ? (alongX ? y1 : x1) : (alongX ? y2 : x2), c1 = Math.min(face, face - u.side * 58), c2 = Math.max(face, face - u.side * 58)
      out.push({ k: 'tall', r: R(alongX ? [u.a, c1, u.b, c2] : [c1, u.a, c2, u.b]) })
    }
  }

  // ── a fireplace where one is written: a stone chimney breast with a glass firebox, facing the room ─────────────
  for (const n of st.notes) {
    if (!/קמין/.test(n.text)) continue
    const [x, y] = n.at, dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
    const inRoom = (px: number, py: number) => { const r = roomAt(px, py); return !!r && !r.outdoor && !r.void && !wall(px, py) }
    // the wall face: from a label on the wall, the nearest way into a room; from a label in the room, the nearest wall
    let hit: { dx: number; dy: number; fx: number; fy: number } | null = null
    if (inRoom(x, y)) { const o = dirs.map(([dx, dy]) => ({ dx, dy, t: toWall(x, y, dx, dy, 110) })).sort((p, q) => p.t - q.t)[0]; if (Number.isFinite(o.t)) hit = { dx: -o.dx, dy: -o.dy, fx: x + o.dx * o.t, fy: y + o.dy * o.t } }
    else { let bt = Infinity; for (const [dx, dy] of dirs) for (let t = 3; t <= 110 && t < bt; t += 3) if (inRoom(x + dx * t, y + dy * t)) { bt = t; hit = { dx, dy, fx: x + dx * t, fy: y + dy * t }; break } }
    if (!hit) continue
    const slab = (half: number, d0: number, d1: number): Box => (hit!.dy ? [hit!.fx - half, Math.min(hit!.fy + hit!.dy * d0, hit!.fy + hit!.dy * d1), hit!.fx + half, Math.max(hit!.fy + hit!.dy * d0, hit!.fy + hit!.dy * d1)] : [Math.min(hit!.fx + hit!.dx * d0, hit!.fx + hit!.dx * d1), hit!.fy - half, Math.max(hit!.fx + hit!.dx * d0, hit!.fx + hit!.dx * d1), hit!.fy + half])
    out.push({ k: 'box', layer: 'int', r: R(slab(95, -2, 14)), y: [0, 2.8], m: 'stone' })
    out.push({ k: 'box', layer: 'int', r: R(slab(60, 14, 16)), y: [.32, .84], m: 'blackGlass' })
    out.push({ k: 'box', layer: 'int', r: R(slab(42, 16, 17)), y: [.38, .45], m: 'flame' })
  }

  // ── drawn furniture and sanitary ware, by shape ────────────────────────────────────────────────────────────────
  const thin = st.strokes.filter(s => s.width <= .4 && !s.dashed && s.pts.length >= 2)
  const boxes: Array<{ b: Box; curved: boolean }> = []
  for (const s of thin) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const [x, y] of s.pts) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y }
    if (x2 - x1 > 340 || y2 - y1 > 340) continue
    const diag = s.pts.length === 2 && Math.abs(Math.abs(s.pts[0][0] - s.pts[1][0]) - Math.abs(s.pts[0][1] - s.pts[1][1])) < 2 && x2 - x1 > 3
    if (diag) continue                                                  // hatching
    boxes.push({ b: [x1, y1, x2, y2], curved: s.curved })
  }
  const parent = boxes.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const gap = (a: Box, b: Box) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]), Math.max(a[1], b[1]) - Math.min(a[3], b[3]))
  for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) if (gap(boxes[i].b, boxes[k].b) <= 2.5) parent[find(i)] = find(k)
  const groups = new Map<number, { b: Box; n: number; curved: number }>()
  boxes.forEach((o, i) => { const g = groups.get(find(i)); if (g) { g.b = [Math.min(g.b[0], o.b[0]), Math.min(g.b[1], o.b[1]), Math.max(g.b[2], o.b[2]), Math.max(g.b[3], o.b[3])]; g.n++; if (o.curved) g.curved++ } else groups.set(find(i), { b: [...o.b] as Box, n: 1, curved: o.curved ? 1 : 0 }) })
  const beds = st.notes.map(n => ({ n, m: /מזרון\s*(\d{2,3})\s*\/\s*(\d{2,3})/.exec(n.text) })).filter(b => b.m)
  const model = (name: string, b: Box, h: number, rot: number, uniform = false) => out.push({ k: 'model', name, r: R(b), h, rot, ...(uniform ? { uniform: true } : {}) })
  const placedBeds = new Set<number>()
  /** a bed of the stated size centred on its label, head towards the nearest wall */
  const bedAt = (x: number, y: number, bs: number, bl: number) => {
    const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => ({ dx, dy, d: toWall(x - dx * bl / 2, y - dy * bl / 2, -dx, -dy, 70) })).sort((p, q) => p.d - q.d)[0]
    const shift = Number.isFinite(opts.d) ? opts.d - 2 : 0                // slide the head up to the wall
    const cx = x - opts.dx * shift, cy = y - opts.dy * shift
    model(bs >= 135 ? 'bedDouble' : 'bedSingle', opts.dx ? [cx - bl / 2, cy - bs / 2, cx + bl / 2, cy + bs / 2] : [cx - bs / 2, cy - bl / 2, cx + bs / 2, cy + bl / 2], bs >= 135 ? 1 : .9, facing(opts.dx, opts.dy))
  }
  for (const { b, curved } of groups.values()) {
    const w = b[2] - b[0], d = b[3] - b[1], s = Math.min(w, d), l = Math.max(w, d), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    if (s < 28 || l > 340) continue
    const room = roomAt(cx, cy); if (!room || room.void || room.outdoor) continue
    const alongX = w >= d
    // which end/side has a wall right behind it
    const behind = (ax: 'x' | 'y') => { const neg = ax === 'x' ? toWall(b[0], cy, -1, 0, 45) : toWall(cx, b[1], 0, -1, 45), pos = ax === 'x' ? toWall(b[2], cy, 1, 0, 45) : toWall(cx, b[3], 0, 1, 45); return neg <= pos ? -1 : 1 }
    const toCentre = (ax: 'x' | 'y') => { const rc = ax === 'x' ? (room.rect[0] + room.rect[2]) / 2 - cx : (room.rect[1] + room.rect[3]) / 2 - cy; return rc >= 0 ? 1 : -1 }
    if (WET.test(room.name)) {
      if (s >= 60 && s <= 95 && l >= 145 && l <= 195 && curved >= 3) model('bathtub', b, .56, alongX ? 0 : Math.PI / 2)   // a tub is drawn with rounded ends
      continue                                                          // toilets and basins are found stroke by stroke below
    }
    // beds: a shape with a mattress label inside it is that bed (or those beds, when two are drawn touching)
    const inside = beds.map((bd, i) => ({ bd, i })).filter(({ bd, i }) => !placedBeds.has(i) && bd.n.at[0] > b[0] - 10 && bd.n.at[0] < b[2] + 10 && bd.n.at[1] > b[1] - 10 && bd.n.at[1] < b[3] + 10)
    if (inside.length) {
      for (const { bd, i } of inside) {
        placedBeds.add(i)
        const bs = Number(bd.m![1]), bl = Number(bd.m![2])
        if (inside.length === 1 && Math.abs(l - bl) < 35 && Math.abs(s - bs) < 35) { const sign = -behind(alongX ? 'x' : 'y'); model(bs >= 135 ? 'bedDouble' : 'bedSingle', b, bs >= 135 ? 1 : .9, alongX ? facing(sign, 0) : facing(0, sign)) }
        else bedAt(bd.n.at[0], bd.n.at[1], bs, bl)
      }
      continue
    }
    if (BED.test(room.name) && !beds.some(bd => roomAt(bd.n.at[0], bd.n.at[1]) === room) && l >= 180 && l <= 220 && ((s >= 75 && s <= 110) || (s >= 135 && s <= 205))) {
      const sign = -behind(alongX ? 'x' : 'y')                           // feet point away from the wall at the head
      model(s >= 135 ? 'bedDouble' : 'bedSingle', b, s >= 135 ? 1 : .9, alongX ? facing(sign, 0) : facing(0, sign))
      continue
    }
    if (SEAT.test(room.name)) {
      if (curved && s >= 65 && s <= 120 && l <= 125) model('armchair', b, .82, alongX ? facing(0, toCentre('y')) : facing(toCentre('x'), 0), true)
      else if (curved && s >= 65 && s <= 120 && l <= 340) model('sofa', b, .78, alongX ? facing(0, toCentre('y')) : facing(toCentre('x'), 0))
      else if (!curved && s >= 45 && s <= 110 && l >= 60 && l <= 170) model('coffeeTable', b, .38, alongX ? 0 : Math.PI / 2)
      continue
    }
    if (KITCHEN.test(room.name)) {
      if (!curved && s >= 80 && s <= 125 && l >= 180 && l <= 340) model('island', b, .92, alongX ? 0 : Math.PI / 2)
      else if (s >= 130 && s <= 260 && l >= 200 && l <= 360) {
        // an island drawn with its stools: the island in the middle, stools along both long sides
        const inset = 44, n = Math.max(2, Math.floor(l / 64))
        model('island', alongX ? [b[0], b[1] + inset, b[2], b[3] - inset] : [b[0] + inset, b[1], b[2] - inset, b[3]], .92, alongX ? 0 : Math.PI / 2)
        for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
          const t = (i + .5) / n
          const c: [number, number] = alongX ? [b[0] + w * t, side < 0 ? b[1] + 22 : b[3] - 22] : [side < 0 ? b[0] + 22 : b[2] - 22, b[1] + d * t]
          model('diningChair', [c[0] - 22, c[1] - 20, c[0] + 22, c[1] + 20], .86, alongX ? facing(0, -side) : facing(-side, 0), true)
        }
      }
      else if (s >= 34 && s <= 58 && l <= 60) model('diningChair', b, .86, 0, true)
    }
  }
  // sanitary ware, stroke by stroke (the symbols touch each other and the walls, so they don't separate as shapes)
  const bb = (pts: number[][]): Box => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of pts) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y } return [x1, y1, x2, y2] }
  const wet = thin.map(sk => ({ sk, b: bb(sk.pts) })).filter(({ b }) => WET.test(roomAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)?.name ?? ''))
  const cisterns = wet.filter(({ sk, b }) => !sk.curved && sk.closed && Math.min(b[2] - b[0], b[3] - b[1]) >= 8 && Math.min(b[2] - b[0], b[3] - b[1]) <= 20 && Math.max(b[2] - b[0], b[3] - b[1]) >= 28 && Math.max(b[2] - b[0], b[3] - b[1]) <= 48)
  const rounds = wet.filter(({ sk, b }) => sk.curved && b[2] - b[0] >= 22 && b[2] - b[0] <= 46 && b[3] - b[1] >= 22 && b[3] - b[1] <= 46)
  const basins: Box[] = []
  for (const { b } of rounds) {
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    const tank = cisterns.find(t => Math.hypot((t.b[0] + t.b[2]) / 2 - cx, (t.b[1] + t.b[3]) / 2 - cy) < 48)
    if (tank) {
      // a bowl with its cistern: the cistern is the back
      const tx = (tank.b[0] + tank.b[2]) / 2, ty = (tank.b[1] + tank.b[3]) / 2, horiz = Math.abs(tx - cx) > Math.abs(ty - cy)
      const u: Box = [Math.min(b[0], tank.b[0]), Math.min(b[1], tank.b[1]), Math.max(b[2], tank.b[2]), Math.max(b[3], tank.b[3])]
      model('toilet', u, 1, horiz ? facing(Math.sign(cx - tx), 0) : facing(0, Math.sign(cy - ty)), true)
    } else basins.push(b)
  }
  // round basins side by side are one vanity; it stands against the nearest wall
  const usedBasin = new Set<number>()
  basins.forEach((b, i) => {
    if (usedBasin.has(i)) return
    let u: Box = [...b] as Box; usedBasin.add(i)
    basins.forEach((o, k) => { if (!usedBasin.has(k) && Math.max(0, Math.max(u[0], o[0]) - Math.min(u[2], o[2]), Math.max(u[1], o[1]) - Math.min(u[3], o[3])) < 30) { u = [Math.min(u[0], o[0]), Math.min(u[1], o[1]), Math.max(u[2], o[2]), Math.max(u[3], o[3])]; usedBasin.add(k) } })
    const cx = (u[0] + u[2]) / 2, cy = (u[1] + u[3]) / 2
    const o = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => ({ dx, dy, t: toWall(cx, cy, -dx, -dy, 70) })).sort((p, q) => p.t - q.t)[0]
    if (!Number.isFinite(o.t)) return
    const half = Math.max(o.dx ? u[3] - u[1] : u[2] - u[0], 50) / 2 + 12, depth = 52, bx = cx - o.dx * (o.t - depth / 2), by = cy - o.dy * (o.t - depth / 2)
    model('vanity', o.dx ? [bx - depth / 2, by - half, bx + depth / 2, by + half] : [bx - half, by - depth / 2, bx + half, by + depth / 2], .55, facing(o.dx, o.dy))
  })
  // rectangular basins
  const done: Array<[number, number]> = []
  for (const { sk, b } of wet) {
    const w = b[2] - b[0], d = b[3] - b[1], s = Math.min(w, d), l = Math.max(w, d), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    if (sk.curved || !sk.closed || s < 28 || s > 55 || l < 40 || l > 75 || done.some(p => Math.hypot(p[0] - cx, p[1] - cy) < 55)) continue
    const o = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => ({ dx, dy, t: toWall(cx, cy, -dx, -dy, 60) })).sort((p, q) => p.t - q.t)[0]
    if (!Number.isFinite(o.t)) continue
    done.push([cx, cy])
    const depth = 50, bx = cx - o.dx * (o.t - depth / 2), by = cy - o.dy * (o.t - depth / 2), half = Math.max(l, 60) / 2
    model('vanity', o.dx ? [bx - depth / 2, by - half, bx + depth / 2, by + half] : [bx - half, by - depth / 2, bx + half, by + depth / 2], .55, facing(o.dx, o.dy))
  }
  // beds whose shape wasn't found: the stated size at the label
  beds.forEach((bd, i) => {
    if (placedBeds.has(i)) return
    const room = roomAt(bd.n.at[0], bd.n.at[1]); if (!room || room.void || room.outdoor) return
    bedAt(bd.n.at[0], bd.n.at[1], Number(bd.m![1]), Number(bd.m![2]))
  })

  // ── ceiling lights: a grid in every indoor room ────────────────────────────────────────────────────────────────
  const lights: Array<[number, number]> = []
  for (const r of st.rooms) {
    if (r.outdoor || r.void) continue
    const w = r.rect[2] - r.rect[0], d = r.rect[3] - r.rect[1], nx = Math.max(1, Math.round(w / 260)), ny = Math.max(1, Math.round(d / 260))
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = r.rect[0] + w * (i + .5) / nx, y = r.rect[1] + d * (j + .5) / ny; if (roomAt(x, y) === r) lights.push([Math.round(x), Math.round(y)]) }
  }
  if (lights.length) out.push({ k: 'lights', p: lights })
  return out
}

/** Paved outdoor floors (balconies, terraces): where the plan is cross-hatched outside the walls. Rectangles in house px. */
export function paved(st: PlanStorey): Box[] {
  const segs: Array<[number[], number[]]> = []
  for (const s of st.strokes) {
    if (s.curved || s.width > .4) continue
    for (let i = 0; i + 1 < s.pts.length; i++) { const a = s.pts[i], b = s.pts[i + 1], dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]); if (dx > 4 && Math.abs(dx - dy) < Math.max(1.5, dx * .08)) segs.push([a, b]) }
  }
  if (segs.length < 40) return []
  const g = Grid.around(segs.map(([a, b]) => [a, b] as [number, number][]), 10, 60)
  for (const [a, b] of segs) { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5); for (let t = 0; t <= n; t++) { const i = Math.floor((a[0] + (b[0] - a[0]) * t / n - g.ox) / 10), j = Math.floor((a[1] + (b[1] - a[1]) * t / n - g.oy) / 10); if (i >= 0 && j >= 0 && i < g.w && j < g.h) g.a[j * g.w + i] = 1 } }
  const closed = close(g, 4), m = g.like()
  // each paved patch squared off: filled between its extremes along every row and every column
  const comp = components(closed, k => closed.a[k] === 1)
  for (let id = 1; id < comp.sizes.length; id++) {
    if (comp.sizes[id] < 30) continue
    const L = new Int32Array(g.h).fill(-1), Rr = new Int32Array(g.h).fill(-1), T = new Int32Array(g.w).fill(-1), B = new Int32Array(g.w).fill(-1)
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (comp.lab.a[j * g.w + i] === id) { if (L[j] < 0) L[j] = i; Rr[j] = i; if (T[i] < 0) T[i] = j; B[i] = j }
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (L[j] >= 0 && i >= L[j] && i <= Rr[j] && T[i] >= 0 && j >= T[i] && j <= B[i]) m.a[j * g.w + i] = 1
  }
  // not under a room: only what lies outside the indoor tiles
  const indoor = (x: number, y: number) => st.rooms.some(r => !r.outdoor && r.tiles.some(t => x >= t[0] && x < t[2] && y >= t[1] && y < t[3]))
  const out: Box[] = [], open = new Map<string, Box>()
  for (let j = 0; j <= m.h; j++) {
    const seen = new Set<string>()
    for (let i = 0; i < m.w && j < m.h;) {
      const on = (ii: number) => m.a[j * m.w + ii] === 1 && !indoor(g.ox + (ii + .5) * 10, g.oy + (j + .5) * 10)
      if (!on(i)) { i++; continue }
      let e = i; while (e < m.w && on(e)) e++
      const key = `${i}:${e}`; seen.add(key)
      const b = open.get(key); if (b) b[3] = g.oy + (j + 1) * 10; else open.set(key, [g.ox + i * 10, g.oy + j * 10, g.ox + e * 10, g.oy + (j + 1) * 10])
      i = e
    }
    for (const [key, b] of open) if (!seen.has(key)) { out.push(b); open.delete(key) }
  }
  return out.filter(b => (b[2] - b[0]) * (b[3] - b[1]) >= 2500)
}

/**
 * Balcony railings: the edges of a paved outdoor floor that meet neither a wall, a window, nor a room — the open
 * drop. Returned as thin boxes (house px); the caller builds glass with a rail on them.
 */
export function balconyRails(st: PlanStorey, pavedRects: Box[]): Box[] {
  if (!pavedRects.length) return []
  const Q = 10
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const r of pavedRects) { x1 = Math.min(x1, r[0]); y1 = Math.min(y1, r[1]); x2 = Math.max(x2, r[2]); y2 = Math.max(y2, r[3]) }
  const ox = x1 - 2 * Q, oy = y1 - 2 * Q, w = Math.ceil((x2 - x1) / Q) + 4, h = Math.ceil((y2 - y1) / Q) + 4
  const inRects = (rs: number[][], x: number, y: number) => rs.some(r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])
  const inPoly = (p: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
  const indoor = st.rooms.filter(r => !r.outdoor).flatMap(r => r.tiles), glass = st.openings.map(o => o.rect), stairs = st.stairs.map(x => x.box)
  // 1 paved, 2 solid (wall, window, room, stair): a railing stands where paved meets neither
  const cell = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const cx = ox + (i + .5) * Q, cy = oy + (j + .5) * Q
    const solid = inRects(indoor, cx, cy) || inRects(glass, cx, cy) || inRects(stairs, cx, cy) || [[0, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]].some(([dx, dy]) => st.walls.some(p => inPoly(p, cx + dx, cy + dy)))
    cell[j * w + i] = solid ? 2 : inRects(pavedRects, cx, cy) ? 1 : 0
  }
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : cell[j * w + i])
  // edges, each with the side its floor is on (+1: floor at larger coordinate)
  type Edge = { o: 'h' | 'v'; at: number; lo: number; hi: number; side: number }
  const edges: Edge[] = []
  for (let j = 0; j <= h; j++) for (let i = 0, run = -1, side = 0; i <= w; i++) {
    const a = at(i, j - 1), b = at(i, j), sd = i < w && a === 1 && b === 0 ? -1 : i < w && a === 0 && b === 1 ? 1 : 0
    if (sd !== side && run >= 0) { if ((i - run) * Q >= 60) edges.push({ o: 'h', at: oy + j * Q, lo: ox + run * Q, hi: ox + i * Q, side }); run = -1 }
    if (sd !== 0 && run < 0) run = i
    side = sd
  }
  for (let i = 0; i <= w; i++) for (let j = 0, run = -1, side = 0; j <= h; j++) {
    const a = at(i - 1, j), b = at(i, j), sd = j < h && a === 1 && b === 0 ? -1 : j < h && a === 0 && b === 1 ? 1 : 0
    if (sd !== side && run >= 0) { if ((j - run) * Q >= 60) edges.push({ o: 'v', at: ox + i * Q, lo: oy + run * Q, hi: oy + j * Q, side }); run = -1 }
    if (sd !== 0 && run < 0) run = j
    side = sd
  }
  // a ragged floor edge gives several parallel steps: keep only the outermost of those within a metre of each other
  const keep = edges.filter(e => !edges.some(f => f !== e && f.o === e.o && f.side === e.side && (f.at - e.at) * e.side < 0 && Math.abs(f.at - e.at) <= 100 && Math.min(f.hi, e.hi) - Math.max(f.lo, e.lo) > .4 * (e.hi - e.lo)))
  const out: Box[] = keep.map(e => (e.o === 'h' ? [e.lo, e.at - 3, e.hi, e.at + 3] : [e.at - 3, e.lo, e.at + 3, e.hi]))
  return out
}
