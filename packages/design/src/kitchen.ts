import type { House } from '@planwalk/house'
import { PX_PER_CM } from './edits'

/**
 * Kitchen designer (sheet A-05). A run is a straight line of cabinets along a wall, stored in a design as an edit
 * ("run:f1.0"). Its position comes from the plan; its modules are the buyer's choice. Standard Israeli sizes:
 *   base units 87 cm + 3 cm worktop = 90 cm, 60 cm deep · tall units 220 cm · wall units 70 cm high, 35 cm deep, bottom at 145 cm
 */
export type ModuleType = 'drawers' | 'doors' | 'sink' | 'hob' | 'dishwasher' | 'corner' | 'fridge' | 'oven' | 'pantry' | 'filler'
export interface Module { t: ModuleType; w: number }
export interface Run {
  k: 'run'; floor: 0 | 1 | 2; id: string
  /** where the run starts and which way it goes, in plan px; the back sits on the wall, the fronts face `facing` */
  x: number; y: number; axis: 'x' | 'y'; length: number /* cm */; depth: number /* cm */; facing: 1 | -1
  modules: Module[]
  uppers: boolean
}

export const MODULES: Record<ModuleType, { he: string; en: string; tall?: boolean; widths: number[] }> = {
  drawers: { he: 'מגירות', en: 'Drawers', widths: [30, 40, 45, 50, 60, 80, 90, 100, 120] },
  doors: { he: 'דלתות', en: 'Doors', widths: [30, 40, 45, 50, 60, 80, 90, 100] },
  sink: { he: 'כיור', en: 'Sink unit', widths: [60, 80, 90, 100] },
  hob: { he: 'כיריים', en: 'Hob unit', widths: [60, 80, 90] },
  dishwasher: { he: 'מדיח', en: 'Dishwasher', widths: [45, 60] },
  corner: { he: 'פינה', en: 'Corner unit', widths: [90, 100, 110] },
  fridge: { he: 'מקרר', en: 'Fridge (tall)', tall: true, widths: [60, 70, 90] },
  oven: { he: 'תנור', en: 'Oven (tall)', tall: true, widths: [60] },
  pantry: { he: 'מזווה', en: 'Pantry (tall)', tall: true, widths: [30, 40, 45, 50, 60, 80] },
  filler: { he: 'השלמה', en: 'Filler', widths: [] },
}
export const BASE_H = .87, TOP_H = .03, TALL_H = 2.2, UPPER_BOTTOM = 1.45, UPPER_H = .7, UPPER_D = 35
export const isTall = (t: ModuleType) => !!MODULES[t].tall
export const runUsed = (r: Run) => r.modules.reduce((a, m) => a + m.w, 0)

/** Exact fill: standard widths that add up to `len` cm, fewest units, preferring the larger widths. */
function fill(len: number, widths = [120, 100, 90, 80, 60, 50, 45, 40, 30]): number[] | null {
  const best: (number[] | null)[] = Array(len + 1).fill(null); best[0] = []
  for (let n = 5; n <= len; n += 5) for (const w of widths) {
    const prev = n - w >= 0 ? best[n - w] : null
    if (prev && (!best[n] || prev.length + 1 < best[n]!.length)) best[n] = [...prev, w]
  }
  return best[len]
}

/**
 * Lay out a run: tall units at the ends as given, then hob, sink and dishwasher and drawers between them,
 * filled exactly to the length (a filler of up to 10 cm takes what standard widths can't).
 */
export function autoFill(length: number, opts: { tallStart?: ModuleType[]; tallEnd?: ModuleType[] } = {}): Module[] {
  const start = (opts.tallStart ?? ['fridge']).map(t => ({ t, w: 60 })), end = (opts.tallEnd ?? ['pantry']).map(t => ({ t, w: 60 }))
  const L = Math.floor(length)
  let base = L - 60 * (start.length + end.length)
  const core: Module[] = []
  // hob · gap · sink · dishwasher, if there is room
  if (base >= 40 + 80 + 40 + 80 + 60) core.push({ t: 'drawers', w: 40 }, { t: 'hob', w: 80 }, { t: 'drawers', w: 40 }, { t: 'sink', w: 80 }, { t: 'dishwasher', w: 60 })
  else if (base >= 60 + 60 + 60) core.push({ t: 'hob', w: 60 }, { t: 'sink', w: 60 }, { t: 'dishwasher', w: 60 })
  base -= core.reduce((a, m) => a + m.w, 0)
  let filler = 0, rest: number[] | null = null
  for (filler = base % 5; filler <= 15 && base - filler >= 0; filler += 5) { rest = fill(base - filler); if (rest) break }
  const drawers = (rest ?? []).map(w => ({ t: 'drawers' as const, w }))
  // drawers split around the cooking/sink core so the hob isn't against a tall unit
  const half = Math.ceil(drawers.length / 2)
  const mods: Module[] = [...start, ...drawers.slice(0, half), ...core, ...drawers.slice(half), ...end]
  if (filler > 0) mods.splice(start.length, 0, { t: 'filler', w: filler })
  return mods
}

export interface KitchenIssue { level: 'error' | 'warning'; message: string; at?: number }
/** Rules a kitchen fitter would check. `at` = module index the issue is about. */
export function checkRun(run: Run, house?: House): KitchenIssue[] {
  const out: KitchenIssue[] = [], m = run.modules, used = runUsed(run)
  if (used > run.length + .5) out.push({ level: 'error', message: `The cabinets are ${used - run.length} cm longer than the wall (${run.length} cm)` })
  else if (run.length - used > 15) out.push({ level: 'warning', message: `${Math.round(run.length - used)} cm left over: add a unit or a filler` })
  m.forEach((x, i) => {
    if (x.t === 'filler' && (x.w < 1 || x.w > 15)) out.push({ level: 'error', message: 'Fillers are 1–15 cm', at: i })
    if (x.t !== 'filler' && !MODULES[x.t].widths.includes(x.w)) out.push({ level: 'error', message: `${MODULES[x.t].en} doesn't come ${x.w} cm wide`, at: i })
    if (x.t === 'hob') {
      const nb = [m[i - 1], m[i + 1]]
      if (nb.some(n => n && isTall(n.t))) out.push({ level: 'warning', message: 'Keep at least 30 cm of worktop between the hob and a tall unit', at: i })
      if (nb.some(n => n?.t === 'sink')) out.push({ level: 'warning', message: 'Hob right next to the sink: keep 40 cm of worktop between them', at: i })
      if (i === 0 || i === m.length - 1) out.push({ level: 'warning', message: 'Hob at the end of the run: keep 30 cm to the wall', at: i })
    }
    if (x.t === 'dishwasher' && m[i - 1]?.t !== 'sink' && m[i + 1]?.t !== 'sink') out.push({ level: 'warning', message: 'Put the dishwasher next to the sink (water and drain)', at: i })
  })
  if (!m.some(x => x.t === 'sink')) out.push({ level: 'warning', message: 'No sink in this run' })
  if (m.filter(x => x.t === 'hob').length > 1) out.push({ level: 'warning', message: 'Two hobs in one run' })
  // walkway in front of the run (islands and other furniture)
  if (house) {
    const front = runFootprint(run), fl = run.floor
    // fixed things only: islands and other cabinets (chairs get pushed in)
    const ahead = house.items.filter(it => it.f === fl && 'r' in it && ((it.k === 'model' && it.name === 'island') || it.k === 'base' || it.k === 'tall' || (it.k === 'cabinet' && it.kind !== 'upper' && it.kind !== 'hood')))
    let narrowest = Infinity
    for (const it of ahead) {
      const r = (it as { r: number[] }).r
      const overlap = run.axis === 'y' ? r[1] < front[3] && r[3] > front[1] : r[0] < front[2] && r[2] > front[0]
      if (!overlap) continue
      const gap = run.axis === 'y'
        ? (run.facing > 0 ? r[0] - front[2] : front[0] - r[2])
        : (run.facing > 0 ? r[1] - front[3] : front[1] - r[3])
      if (gap > 0) narrowest = Math.min(narrowest, gap / PX_PER_CM)
    }
    if (narrowest < 90) out.push({ level: 'warning', message: `Only ${Math.round(narrowest)} cm to walk in front of the cabinets (at least 90 cm, 100–120 is comfortable)` })
  }
  return out
}

/** Plan rectangle a run occupies (base depth). */
export function runFootprint(run: Run): [number, number, number, number] {
  const L = run.length * PX_PER_CM, D = run.depth * PX_PER_CM
  if (run.axis === 'y') { const x1 = run.facing > 0 ? run.x : run.x - D; return [x1, run.y, x1 + D, run.y + L] }
  const y1 = run.facing > 0 ? run.y : run.y - D; return [run.x, y1, run.x + L, y1 + D]
}

/**
 * Runs as drawn in the plan, in one room: base and tall items that share a wall line become one run,
 * starting from the plan's own tall/base split.
 */
export function runsFromPlan(house: House, floor: 0 | 1 | 2, room: number): Run[] {
  const fl = house.floors[floor], rm = fl.rooms[room]; if (!rm) return []
  const inRoom = (r: number[]) => r[0] >= rm[2] - 2 && r[2] <= rm[4] + 2 && r[1] >= rm[3] - 2 && r[3] <= rm[5] + 2
  const items = house.items.filter(it => it.f === floor && (it.k === 'base' || it.k === 'tall') && inRoom((it as { r: number[] }).r)) as Array<{ k: 'base' | 'tall'; r: number[] }>
  const groups = new Map<string, typeof items>()
  for (const it of items) {
    const [x1, y1, x2, y2] = it.r, vertical = y2 - y1 > x2 - x1
    const key = vertical ? `y:${Math.round(x1)}:${Math.round(x2)}` : `x:${Math.round(y1)}:${Math.round(y2)}`
    groups.set(key, [...(groups.get(key) ?? []), it])
  }
  const runs: Run[] = []
  let n = 0
  for (const [key, list] of groups) {
    const axis = key[0] as 'x' | 'y', ax = axis === 'x' ? 0 : 1
    list.sort((p, q) => p.r[ax] - q.r[ax])
    const lo = list[0].r[ax], hi = list[list.length - 1].r[2 + ax]
    const [c1, c2] = axis === 'y' ? [list[0].r[0], list[0].r[2]] : [list[0].r[1], list[0].r[3]]
    // the back is on the side nearer the room's wall
    const roomLo = axis === 'y' ? rm[2] : rm[3], roomHi = axis === 'y' ? rm[4] : rm[5]
    const facing: 1 | -1 = c1 - roomLo <= roomHi - c2 ? 1 : -1
    const back = facing > 0 ? c1 : c2
    const length = Math.round((hi - lo) / PX_PER_CM), depth = Math.max(55, Math.min(65, Math.round((c2 - c1) / PX_PER_CM)))
    const startTall = list[0].k === 'tall', endTall = list.length > 1 && list[list.length - 1].k === 'tall'
    runs.push({
      k: 'run', floor, id: String(n++), axis, length, depth, facing,
      x: axis === 'y' ? back : lo, y: axis === 'y' ? lo : back,
      modules: autoFill(length, { tallStart: startTall ? ['fridge'] : [], tallEnd: endTall ? ['oven'] : [] }),
      uppers: false,
    })
  }
  return runs
}

/** Windows on the wall behind a run (uppers can't go there), as [from, to] cm along the run. */
export function windowsBehind(house: House, run: Run): Array<[number, number, number, number]> {
  const fl = house.floors[run.floor], ax = run.axis === 'x' ? 0 : 1, start = run.axis === 'x' ? run.x : run.y
  const back = run.axis === 'x' ? run.y : run.x
  return fl.glass
    .filter(g => { const c1 = run.axis === 'x' ? g[1] : g[0], c2 = run.axis === 'x' ? g[3] : g[2]; return Math.abs((run.facing > 0 ? c2 : c1) - back) < 25 || (c1 <= back && c2 >= back - 25) })
    .map(g => [(g[ax] - start) / PX_PER_CM, (g[2 + ax] - start) / PX_PER_CM, g[4], g[5]] as [number, number, number, number])
    .filter(([a, b]) => b > 0 && a < run.length)
}

/** Turn a run into house items for the engine (cabinets, worktop), replacing what the plan drew there. */
export function applyRun(house: House, run: Run) {
  const fp = runFootprint(run), fl = run.floor
  const within = (r: number[]) => r[0] >= fp[0] - 6 && r[2] <= fp[2] + 6 && r[1] >= fp[1] - 6 && r[3] <= fp[3] + 6
  house.items = house.items.filter(it => !(it.f === fl && 'r' in it && (it.k === 'base' || it.k === 'tall' || (it.k === 'box' && ['blackGlass', 'quartz'].includes((it as { m: string }).m))) && within((it as { r: number[] }).r)))
  const ax = run.axis === 'x' ? 0 : 1, D = run.depth * PX_PER_CM, back = run.axis === 'x' ? run.y : run.x
  const dir = run.axis === 'x' ? (run.facing > 0 ? 'y+' : 'y-') : (run.facing > 0 ? 'x+' : 'x-')
  const rect = (from: number, to: number, depthPx = D): [number, number, number, number] => {
    const a = (run.axis === 'x' ? run.x : run.y) + from * PX_PER_CM, b = (run.axis === 'x' ? run.x : run.y) + to * PX_PER_CM
    const c1 = run.facing > 0 ? back : back - depthPx, c2 = run.facing > 0 ? back + depthPx : back
    return ax === 0 ? [a, c1, b, c2] : [c1, a, c2, b]
  }
  const win = windowsBehind(house, run)
  let at = 0, topFrom: number | null = null
  const tops: Array<[number, number]> = []
  run.modules.forEach((m, i) => {
    const r = rect(at, at + m.w)
    house.items.push({ k: 'cabinet', f: fl, r, kind: m.t, dir, n: i } as never)
    if (isTall(m.t)) { if (topFrom != null) { tops.push([topFrom, at]); topFrom = null } }
    else {
      if (topFrom == null) topFrom = at
      const free = !win.some(([a, b]) => a < at + m.w && b > at)
      if (run.uppers && m.t !== 'filler' && free) house.items.push({ k: 'cabinet', f: fl, r: rect(at, at + m.w, UPPER_D * PX_PER_CM), kind: m.t === 'hob' ? 'hood' : 'upper', dir, n: i } as never)
    }
    at += m.w
  })
  if (topFrom != null) tops.push([topFrom, at])
  for (const [a, b] of tops) {
    const r = rect(a, b, D + 2 * PX_PER_CM)                                   // 2 cm overhang at the front
    house.items.push({ k: 'box', f: fl, r, y: [BASE_H, BASE_H + TOP_H], m: 'quartz', rad: .003 } as never)
  }
}
