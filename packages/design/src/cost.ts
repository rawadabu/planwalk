import type { House } from '@planwalk/house'
import { BASE, finish, type Part } from './catalog'
import { applyEdits, PX_PER_CM, type WallEdit, type WindowEdit } from './edits'
import { MODULES, isTall, runsFromPlan, type ModuleType, type Run } from './kitchen'
import { resolveFinish } from './resolve'
import type { Design } from './schema'

/**
 * Costing (sheet A-06). Quantities come from the geometry of the edited house, prices from the organisation's
 * price book. Everything is computed before VAT and totalled with VAT at the end.
 */
export interface PriceBook {
  currency: 'ILS'
  vat: number                                             // 0.18
  /** finish id → price per unit, material + labour (m² for surfaces, linear metre for worktops) */
  finishes: Record<string, number>
  /** joinery fronts: multiplier on the cabinet price per finish id (walnut veneer costs more than white) */
  fronts: Record<string, number>
  /** cabinet price for a 60 cm module of each type (other widths pro rata); tall units included */
  modules: Record<ModuleType | 'upper' | 'hood', number>
  kitchenInstallPerM: number                              // fitting, per metre of run
  windowPerM2: Record<string, number>                     // aluminium window by frame finish, per m²
  windowChangeFee: number                                 // per changed opening (site work)
  wallMovePerM2: number                                   // demolish + rebuild a partition, per m² of wall
}

/** Example prices (₪ before VAT, late 2026) until an organisation sets its own. */
export const DEFAULT_PRICES: PriceBook = {
  currency: 'ILS', vat: .18,
  finishes: {
    'paint-warm-white': 38, 'paint-pure-white': 38, 'paint-greige': 42, 'paint-sage': 46, 'paint-clay': 46, 'paint-mist-blue': 46, 'paint-charcoal': 48,
    'tile-light': 240, 'tile-warm-grey': 255, 'tile-dark': 270,
    'wood-oak': 420, 'wood-oak-smoked': 460, 'wood-oak-white': 440, 'wood-walnut': 520,
    'concrete-polished': 380,
    'stone-quartz-white': 1450, 'stone-granite-black': 1250, 'stone-travertine': 1650,
  },
  fronts: { 'wood-walnut': 1.35, 'wood-oak': 1.25, 'wood-oak-smoked': 1.28, 'wood-oak-white': 1.25, 'lacquer-navy': 1.15, 'lacquer-sage': 1.15, 'lacquer-white': 1.0, 'lacquer-black': 1.12 },
  modules: { drawers: 1700, doors: 1350, sink: 1500, hob: 1650, dishwasher: 550, corner: 2600, fridge: 3300, oven: 3600, pantry: 3200, filler: 150, upper: 950, hood: 1900 },
  kitchenInstallPerM: 450,
  windowPerM2: { 'metal-black': 1900, 'metal-anthracite': 1900, 'metal-white': 1750, 'metal-bronze': 2100 },
  windowChangeFee: 1200,
  wallMovePerM2: 650,
}
/** An organisation's book over the defaults (missing entries fall back). */
export function priceBook(over?: Partial<PriceBook> | null): PriceBook {
  const d = DEFAULT_PRICES
  if (!over) return d
  return { ...d, ...over, finishes: { ...d.finishes, ...over.finishes }, fronts: { ...d.fronts, ...over.fronts }, modules: { ...d.modules, ...over.modules }, windowPerM2: { ...d.windowPerM2, ...over.windowPerM2 } }
}

export interface CostLine { group: string; item: string; qty: number; unit: 'm²' | 'm' | 'pcs' | ''; unitPrice: number; total: number; key: string }
export interface CostReport {
  lines: CostLine[]
  byGroup: Array<{ group: string; total: number }>
  net: number; vat: number; total: number              // this design
  baseTotal: number                                    // the architect's base, same price book
  upgrade: number                                      // total − baseTotal (incl. VAT)
  missing: string[]                                    // finishes with no price in the book
}

const H = 2.8
const dimsOf = (label: string) => { const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/.exec(label); return m ? [+m[1] / 100, +m[2] / 100] : null }

/** Surface quantities of one indoor room: floor m², wall m² (minus windows on its edges), ceiling m². */
export function roomQuantities(house: House, floor: 0 | 1 | 2, room: number) {
  const fl = house.floors[floor], r = fl.rooms[room]
  const x1 = Math.max(r[2], 105), y1 = Math.max(r[3], 105), x2 = Math.min(r[4], 1040), y2 = Math.min(r[5], 1460)
  const d = dimsOf(r[1]) ?? [(x2 - x1) / PX_PER_CM / 100, (y2 - y1) / PX_PER_CM / 100]
  const area = d[0] * d[1]
  // windows sitting on this room's edges
  let glazing = 0
  for (const [gx1, gy1, gx2, gy2, sill, head] of fl.glass) {
    const cx = (gx1 + gx2) / 2, cy = (gy1 + gy2) / 2
    const onEdge = cx > x1 - 25 && cx < x2 + 25 && cy > y1 - 25 && cy < y2 + 25 && (Math.min(Math.abs(cx - x1), Math.abs(cx - x2)) < 25 || Math.min(Math.abs(cy - y1), Math.abs(cy - y2)) < 25)
    if (onEdge) glazing += Math.max(gx2 - gx1, gy2 - gy1) / PX_PER_CM / 100 * (head - sill)
  }
  const walls = Math.max(0, 2 * (d[0] + d[1]) * H - glazing)
  return { name: r[0], floor: area, walls, ceiling: area }
}

/** The kitchen runs a design draws: its own, or the plan's kitchen when it has none. */
export function kitchenRuns(house: House, design: Design): Run[] {
  const own = Object.values(design.edits).filter(e => e.k === 'run') as Run[]
  if (own.length) return own
  for (const f of [1, 0, 2] as const) {
    const i = house.floors[f].rooms.findIndex((r, n) => n < house.floors[f].indoor && r[0] === 'מטבח')
    if (i >= 0) return runsFromPlan(house, f, i)
  }
  return []
}

function lines(base: House, design: Design, P: PriceBook, missing: Set<string>): CostLine[] {
  const { house } = applyEdits(base, design.edits)
  const out: CostLine[] = []
  const priceOf = (id: string) => { const p = P.finishes[id]; if (p == null) missing.add(id); return p ?? 0 }
  const name = (id: string) => finish(id)?.he ?? id
  // surfaces, room by room
  for (const f of [0, 1, 2] as const) {
    const fl = house.floors[f], seen = new Map<string, number>()
    for (let i = 0; i < fl.indoor; i++) {
      const q = roomQuantities(house, f, i), n = (seen.get(q.name) ?? 0) + 1; seen.set(q.name, n)
      const same = fl.rooms.slice(0, fl.indoor).filter(r => r[0] === q.name).length > 1
      const group = `${q.name}${same ? ` ${n}` : ''} · ${fl.name}`
      for (const [part, qty] of [['floor', q.floor], ['walls', q.walls], ['ceiling', q.ceiling]] as Array<[Part, number]>) {
        if (qty <= 0) continue
        const id = resolveFinish(design, part, { floor: f, room: i }).id, up = priceOf(id)
        out.push({ group, item: `${part === 'floor' ? 'רצפה' : part === 'walls' ? 'קירות' : 'תקרה'} · ${name(id)}`, qty: round(qty, 1), unit: 'm²', unitPrice: up, total: qty * up, key: `${part}@f${f}.r${i}` })
      }
    }
  }
  // kitchen
  for (const run of kitchenRuns(house, design)) {
    const front = resolveFinish(design, 'joinery', { floor: run.floor }).id, k = P.fronts[front] ?? 1
    const top = resolveFinish(design, 'worktop', { floor: run.floor }).id
    const counts = new Map<string, { t: ModuleType; w: number; n: number }>()
    for (const m of run.modules) { const key = `${m.t}|${m.w}`; counts.set(key, { t: m.t, w: m.w, n: (counts.get(key)?.n ?? 0) + 1 }) }
    for (const { t, w, n } of counts.values()) {
      const up = P.modules[t] * (t === 'filler' ? 1 : w / 60) * (t === 'filler' || t === 'dishwasher' ? 1 : k)
      out.push({ group: 'מטבח', item: `${MODULES[t].he} ${w} ס״מ · ${name(front)}`, qty: n, unit: 'pcs', unitPrice: round(up), total: up * n, key: `run:${run.id}:${t}${w}` })
    }
    if (run.uppers) {
      const upperW = run.modules.filter(m => !isTall(m.t) && m.t !== 'filler' && m.t !== 'hob').reduce((a, m) => a + m.w, 0)
      if (upperW) out.push({ group: 'מטבח', item: `ארונות עליונים · ${name(front)}`, qty: round(upperW / 100, 2), unit: 'm', unitPrice: round(P.modules.upper / .6 * k), total: upperW / 60 * P.modules.upper * k, key: `run:${run.id}:upper` })
      if (run.modules.some(m => m.t === 'hob')) out.push({ group: 'מטבח', item: 'קולט אדים', qty: 1, unit: 'pcs', unitPrice: P.modules.hood, total: P.modules.hood, key: `run:${run.id}:hood` })
    }
    const topM = run.modules.filter(m => !isTall(m.t)).reduce((a, m) => a + m.w, 0) / 100
    out.push({ group: 'מטבח', item: `משטח · ${name(top)}`, qty: round(topM, 2), unit: 'm', unitPrice: priceOf(top), total: topM * priceOf(top), key: `run:${run.id}:top` })
    out.push({ group: 'מטבח', item: 'התקנה', qty: round(run.length / 100, 2), unit: 'm', unitPrice: P.kitchenInstallPerM, total: run.length / 100 * P.kitchenInstallPerM, key: `run:${run.id}:install` })
  }
  // construction changes
  for (const [key, e] of Object.entries(design.edits)) {
    if (e.k === 'window') {
      const w = e as WindowEdit, g0 = base.floors[w.floor].glass[w.index], g1 = house.floors[w.floor].glass[w.index]; if (!g0 || !g1) continue
      const area = (g: number[]) => Math.max(g[2] - g[0], g[3] - g[1]) / PX_PER_CM / 100 * (g[5] - g[4])
      const frame = resolveFinish(design, 'frames', { floor: w.floor }).id, per = P.windowPerM2[frame] ?? P.windowPerM2['metal-black'] ?? 0
      const extra = Math.max(0, area(g1) - area(g0))
      out.push({ group: 'שינויים', item: `שינוי חלון · ${round(area(g0), 2)} ← ${round(area(g1), 2)} מ״ר`, qty: 1, unit: 'pcs', unitPrice: round(P.windowChangeFee + extra * per), total: P.windowChangeFee + extra * per, key })
    }
    if (e.k === 'wall') {
      const w = e as WallEdit; if (!w.by) continue
      const m2 = (w.hi - w.lo) / PX_PER_CM / 100 * H
      out.push({ group: 'שינויים', item: `הזזת קיר ${Math.abs(w.by)} ס״מ`, qty: round(m2, 1), unit: 'm²', unitPrice: P.wallMovePerM2, total: m2 * P.wallMovePerM2, key })
    }
  }
  // the frames finish itself costs only when it differs from the base (a recolour of every window)
  const frames = resolveFinish(design, 'frames').id
  if (frames !== BASE.frames) {
    let m2 = 0
    for (const f of [0, 1, 2] as const) for (const g of house.floors[f].glass) m2 += Math.max(g[2] - g[0], g[3] - g[1]) / PX_PER_CM / 100 * (g[5] - g[4])
    const per = Math.max(0, (P.windowPerM2[frames] ?? 0) - (P.windowPerM2[BASE.frames] ?? 0)) + 120
    out.push({ group: 'שינויים', item: `מסגרות חלונות · ${name(frames)}`, qty: round(m2, 1), unit: 'm²', unitPrice: per, total: m2 * per, key: 'frames' })
  }
  return out
}

export function costReport(base: House, design: Design, book?: Partial<PriceBook> | null): CostReport {
  const P = priceBook(book), missing = new Set<string>()
  const L = lines(base, design, P, missing)
  const baseDesign: Design = { format: 'design@1', finishes: {}, edits: {} }
  const baseNet = lines(base, baseDesign, P, new Set()).reduce((a, l) => a + l.total, 0)
  const net = L.reduce((a, l) => a + l.total, 0)
  const groups = new Map<string, number>()
  for (const l of L) groups.set(l.group, (groups.get(l.group) ?? 0) + l.total)
  const total = net * (1 + P.vat), baseTotal = baseNet * (1 + P.vat)
  return {
    lines: L.map(l => ({ ...l, total: round(l.total) })),
    byGroup: [...groups].map(([group, t]) => ({ group, total: round(t) })),
    net: round(net), vat: round(net * P.vat), total: round(total), baseTotal: round(baseTotal), upgrade: round(total - baseTotal), missing: [...missing],
  }
}
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d
