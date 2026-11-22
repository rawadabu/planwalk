import { MODULES, isTall, type ModuleType, type Run } from './kitchen'

/**
 * Shop drawings for the carpenter (sheet A-07): from a kitchen run to cabinets, panels, sheets, worktop and hardware.
 * Millimetres throughout. Construction: 18 mm carcass board, 3 mm HDF backs, fronts 18 mm in the chosen finish
 * with 3 mm gaps, plinth 100 mm. Heights match the 3D model: base 100 + 770 = 870 + 30 worktop; tall 2200; wall units 700 from 1450.
 */
export const T = 18, GAP = 3, PLINTH = 100, BASE_CARCASS = 770, TALL_CARCASS = 2100, SHOP_UPPER_H = 700, SHOP_UPPER_D = 330, TOP = 30, OVERHANG = 20
export const SHEET = { w: 2800, h: 2070, kerf: 4, trim: 10 }
export const SLAB_MAX = 3000                                  // longest stone/quartz worktop piece

export type Material = 'carcass' | 'front' | 'back'
export interface Panel { cab: number; name: string; w: number; h: number; qty: number; material: Material; edges: string; grain?: boolean }
export interface Cabinet {
  no: number; type: ModuleType | 'upper'; he: string; w: number; h: number; d: number
  fronts: Array<{ kind: 'door' | 'drawer' | 'panel'; w: number; h: number }>
  hinges: number; runners: number; handles: number; legs: number; shelves: number; note: string
}

const doorsFor = (w: number) => (w > 600 ? 2 : 1)                     // one door up to 60 cm, two above

/** One cabinet per module (+ a wall unit above it when the run has them and there is no window). */
export function cabinets(run: Run, upperFree: (fromMm: number, toMm: number) => boolean = () => true): Cabinet[] {
  const D = run.depth * 10 - 20 - 20                           // carcass depth: 20 mm off the wall, 20 mm front
  const out: Cabinet[] = []
  let at = 0, no = 1
  for (const m of run.modules) {
    const W = m.w * 10, he = MODULES[m.t].he
    const c: Cabinet = { no: no++, type: m.t, he, w: W, h: isTall(m.t) ? PLINTH + TALL_CARCASS : PLINTH + BASE_CARCASS, d: D, fronts: [], hinges: 0, runners: 0, handles: 0, legs: W >= 800 ? 6 : 4, shelves: 0, note: '' }
    const door = (h: number) => { const n = doorsFor(W); for (let i = 0; i < n; i++) c.fronts.push({ kind: 'door', w: W / n - GAP, h: h - GAP }); c.hinges += n * (h > 1500 ? 4 : h > 900 ? 3 : 2); c.handles += n }
    const drawers = (hs: number[]) => { for (const h of hs) c.fronts.push({ kind: 'drawer', w: W - GAP, h: h - GAP }); c.runners += hs.length; c.handles += hs.length }
    switch (m.t) {
      case 'drawers': drawers([220, 260, 290]); break
      case 'hob': drawers([220, 260, 290]); c.note = 'כיריים מעל: מגירה עליונה רדודה'; break
      case 'doors': case 'corner': door(BASE_CARCASS); c.shelves = 1; if (m.t === 'corner') c.note = 'פינה עיוורת'; break
      case 'sink': door(BASE_CARCASS); c.note = 'בלי מדף; פתחים לצנרת בגב'; break
      case 'dishwasher': c.fronts.push({ kind: 'panel', w: W - GAP, h: BASE_CARCASS - GAP }); c.legs = 0; c.note = 'מדיח אינטגרלי: חזית בלבד, בלי גוף'; break
      case 'filler': c.fronts.push({ kind: 'panel', w: W, h: BASE_CARCASS }); c.legs = 0; c.handles = 0; c.note = 'השלמה'; break
      case 'fridge': door(1450); door(650); c.note = 'מקרר אינטגרלי בגובה 1770; אוורור בסוקל'; break
      case 'oven': drawers([400]); door(680); c.shelves = 2; c.note = 'נישה לתנור 600 ולמיקרוגל 380'; break
      case 'pantry': door(1300); door(800); c.shelves = 5; break
    }
    out.push(c)
    if (run.uppers && !isTall(m.t) && m.t !== 'filler' && m.t !== 'hob' && upperFree(at, at + W)) {
      const u: Cabinet = { no: no++, type: 'upper', he: 'ארון עליון', w: W, h: SHOP_UPPER_H, d: SHOP_UPPER_D, fronts: [], hinges: 0, runners: 0, handles: 0, legs: 0, shelves: 1, note: `מעל ארון ${c.no}; תחתית ב-1450` }
      const n = doorsFor(W); for (let i = 0; i < n; i++) u.fronts.push({ kind: 'door', w: W / n - GAP, h: SHOP_UPPER_H - GAP }); u.hinges = n * 2; u.handles = n
      out.push(u)
    }
    at += W
  }
  return out
}

/** Every board to cut, with edge banding: L = one long edge, 4 = all round. */
export function panels(cabs: Cabinet[]): Panel[] {
  const out: Panel[] = []
  const add = (p: Panel) => { if (p.w > 0 && p.h > 0 && p.qty > 0) out.push({ ...p, w: Math.round(p.w), h: Math.round(p.h) }) }
  for (const c of cabs) {
    const inner = c.w - 2 * T
    const body = c.type === 'upper' ? SHOP_UPPER_H : c.h - PLINTH
    if (c.type !== 'dishwasher' && c.type !== 'filler') {
      add({ cab: c.no, name: 'דופן', w: c.d, h: body, qty: 2, material: 'carcass', edges: 'L' })
      add({ cab: c.no, name: 'תחתית', w: inner, h: c.d, qty: 1, material: 'carcass', edges: 'L' })
      if (c.type === 'upper' || isTall(c.type as ModuleType)) add({ cab: c.no, name: 'תקרה', w: inner, h: c.d, qty: 1, material: 'carcass', edges: 'L' })
      else add({ cab: c.no, name: 'פס עליון', w: inner, h: 100, qty: 2, material: 'carcass', edges: 'L' })
      add({ cab: c.no, name: 'מדף', w: inner - 2, h: c.d - 30, qty: c.shelves, material: 'carcass', edges: 'L' })
      add({ cab: c.no, name: 'גב', w: c.w - 4, h: body - 4, qty: 1, material: 'back', edges: '' })
    }
    for (const f of c.fronts) add({ cab: c.no, name: f.kind === 'door' ? 'דלת' : f.kind === 'drawer' ? 'חזית מגירה' : 'חזית', w: f.w, h: f.h, qty: 1, material: 'front', edges: '4', grain: true })
  }
  // merge identical boards
  const merged = new Map<string, Panel>()
  for (const p of out) { const k = [p.cab, p.name, p.w, p.h, p.material].join('|'); const m = merged.get(k); if (m) m.qty += p.qty; else merged.set(k, { ...p }) }
  return [...merged.values()]
}

export interface Placed { x: number; y: number; w: number; h: number; label: string }
export interface SheetLayout { material: Material; sheets: Placed[][]; used: number /* 0..1 */ }

/**
 * Lay panels on 2800 × 2070 boards: shelf (guillotine) packing, tallest first, 4 mm saw kerf, 10 mm trim.
 * Panels with grain (fronts) keep their direction; plain carcass board may turn.
 */
export function nest(list: Panel[], material: Material): SheetLayout {
  const items: Array<{ w: number; h: number; label: string; grain: boolean }> = []
  for (const p of list.filter(p => p.material === material)) for (let i = 0; i < p.qty; i++) items.push({ w: p.w, h: p.h, label: `${p.cab}·${p.name}`, grain: !!p.grain })
  const W = SHEET.w - 2 * SHEET.trim, H = SHEET.h - 2 * SHEET.trim, K = SHEET.kerf
  // lay each piece with its long side along the board unless grain says otherwise
  for (const it of items) if (!it.grain && it.h > it.w) [it.w, it.h] = [it.h, it.w]
  items.sort((a, b) => b.h - a.h || b.w - a.w)
  const sheets: Placed[][] = []
  for (const it of items) {
    if (it.w > W || it.h > H) { if (!it.grain && it.h <= W && it.w <= H) [it.w, it.h] = [it.h, it.w]; else { sheets.push([{ x: 0, y: 0, w: it.w, h: it.h, label: it.label + ' (גדול מלוח)' }]); continue } }
    let placed = false
    for (const s of sheets) {
      // shelves: rows of the sheet, each as tall as its first piece
      const rows = new Map<number, { h: number; x: number }>()
      for (const p of s) { const r = rows.get(p.y) ?? { h: 0, x: 0 }; r.h = Math.max(r.h, p.h); r.x = Math.max(r.x, p.x + p.w + K); rows.set(p.y, r) }
      for (const [y, r] of rows) if (it.h <= r.h && r.x + it.w <= W) { s.push({ x: r.x, y, w: it.w, h: it.h, label: it.label }); placed = true; break }
      if (placed) break
      const top = [...rows].reduce((a, [y, r]) => Math.max(a, y + r.h + K), 0)
      if (top + it.h <= H) { s.push({ x: 0, y: top, w: it.w, h: it.h, label: it.label }); placed = true; break }
    }
    if (!placed) sheets.push([{ x: 0, y: 0, w: it.w, h: it.h, label: it.label }])
  }
  const area = items.reduce((a, it) => a + it.w * it.h, 0)
  return { material, sheets, used: sheets.length ? area / (sheets.length * W * H) : 0 }
}

export interface WorktopPiece { from: number; length: number; depth: number; cutouts: Array<{ kind: 'sink' | 'hob'; x: number; y: number; w: number; d: number }>; joint?: boolean }
/** Worktop pieces over the base units (between tall units), with sink and hob cut-outs; longer than a slab → two pieces. */
export function worktop(run: Run): WorktopPiece[] {
  const depth = run.depth * 10 - 20 + OVERHANG
  const segs: Array<{ from: number; to: number; mods: Array<{ t: ModuleType; at: number; w: number }> }> = []
  let at = 0, cur: (typeof segs)[number] | null = null
  for (const m of run.modules) {
    const W = m.w * 10
    if (isTall(m.t)) cur = null
    else { if (!cur) { cur = { from: at, to: at, mods: [] }; segs.push(cur) } cur.mods.push({ t: m.t, at, w: W }); cur.to = at + W }
    at += W
  }
  const pieces: WorktopPiece[] = []
  for (const s of segs) {
    const len = s.to - s.from
    const cut = (m: { t: ModuleType; at: number; w: number }) => {
      if (m.t === 'sink') { const w = Math.min(m.w - 120, 760); return { kind: 'sink' as const, x: m.at + m.w / 2, y: depth - 300, w, d: 450 } }
      if (m.t === 'hob') { const w = m.w >= 900 ? 840 : m.w >= 800 ? 750 : 560; return { kind: 'hob' as const, x: m.at + m.w / 2, y: depth - 310, w, d: 490 } }
      return null
    }
    const cuts = s.mods.map(cut).filter(Boolean) as WorktopPiece['cutouts']
    if (len <= SLAB_MAX) { pieces.push({ from: s.from, length: len, depth, cutouts: cuts.map(c => ({ ...c, x: c.x - s.from })) }); continue }
    // split between modules, as near the middle as possible, never through a cut-out
    const edges = s.mods.map(m => m.at + m.w).slice(0, -1).filter(e => !cuts.some(c => Math.abs(c.x - e) < c.w / 2 + 50))
    const mid = s.from + len / 2, j = edges.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0] ?? mid
    for (const [a, b] of [[s.from, j], [j, s.to]]) pieces.push({ from: a, length: b - a, depth, joint: true, cutouts: cuts.filter(c => c.x > a && c.x < b).map(c => ({ ...c, x: c.x - a })) })
  }
  return pieces
}

export interface Hardware { hinges: number; runners: number; handles: number; legs: number; plinthM: number; edgeBandM: number; frontsM2: number; carcassM2: number; backM2: number }
export function hardware(cabs: Cabinet[], ps: Panel[]): Hardware {
  const s = (f: (c: Cabinet) => number) => cabs.reduce((a, c) => a + f(c), 0)
  const m2 = (mat: Material) => ps.filter(p => p.material === mat).reduce((a, p) => a + p.w * p.h * p.qty, 0) / 1e6
  const band = ps.reduce((a, p) => a + p.qty * (p.edges === '4' ? 2 * (p.w + p.h) : p.edges === 'L' ? Math.max(p.w, p.h) : 0), 0) / 1000
  return {
    hinges: s(c => c.hinges), runners: s(c => c.runners), handles: s(c => c.handles), legs: s(c => c.legs),
    plinthM: cabs.filter(c => c.type !== 'upper').reduce((a, c) => a + c.w, 0) / 1000,
    edgeBandM: Math.round(band * 10) / 10, frontsM2: Math.round(m2('front') * 100) / 100, carcassM2: Math.round(m2('carcass') * 100) / 100, backM2: Math.round(m2('back') * 100) / 100,
  }
}
