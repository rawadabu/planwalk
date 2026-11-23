import type { Cad, CadLine } from './dwg'
import type { PdfLayers, Pt } from './pdf'
import type { Box } from './labels'
import { analyse, PX_PER_M, type Plan, type PlanStorey } from './sheet'
import { openings as readOpenings, type Opening } from './openings'
import { clipX, bbox, type Poly } from './plan'
import { Grid, components } from './raster'
import type { Stroke } from './stairs'
import { cadThings, type Instance } from './cadthings'

/**
 * A CAD drawing (DWG) → plan@1. The drawing is in real units, so nothing is calibrated and nothing is read by a model:
 * walls are the thin bodies enclosed by the wall layer's lines, windows the symbols on the opening layer, doors the
 * door-wide gaps between wall ends, and rooms take the names written in them. Everything after that (rooms, stairs,
 * the house itself) is the same code the PDF path uses.
 */
export type CadRole = 'wall' | 'column' | 'opening' | 'text' | 'dim' | 'ignore' | 'other'
export interface CadOptions { unit?: 'left' | 'right'; /** layer name → role, overriding what the names suggest */ roles?: Record<string, CadRole> }

const CELL = 2                              // px per raster cell
const ROOMY = 23                            // cells: a free square this wide (≈ 46 cm) is a space, anything narrower is a wall body
const K = PX_PER_M / 100                    // px per cm

const IGNORE = /topo|tree|fanc|fence|gvul|parcel|mgrsh|mkrsh|heter|hatch|area|חשמל|elec|simn|סימ|grid|axis|ציר|border|gilyon|legan|legend|matruk|contour|^-|slp_|sld_|kotrt|בקשה|pgvul|hloka|vport|defpoints|תאורה|תקשורת/i
const TITLE = /תכנית/, ROOF = /גג/
const STOREY_WORDS: Array<[RegExp, number]> = [[/מרתף/, -1], [/קרקע|כניסה/, 0], [/ראשונה|קומה א(?![א-ת])/, 1], [/שנייה|שניה|קומה ב(?![א-ת])/, 2], [/שלישית|קומה ג(?![א-ת])/, 3]]
const STOREY_NAMES: Record<number, string> = { [-1]: 'מרתף', 0: 'קומת קרקע', 1: 'קומה ראשונה', 2: 'קומה שנייה', 3: 'קומה שלישית' }
const ROOM = /סלון|מטבח|ממ"ד|ממ״ד|שינה|חדר|שירותים|מקלחת|אמבט|רחצה|מרפסת|מבוא|כניסה|אוכל|כביסה|ארונות|מחסן|חני|גינה|חצר|משפחה|עבודה|מעבר|פרוזדור|חלל|מזווה|לובי|יחידת/
const FIXTURE = /מקרר|כיור|תנור|כיריים|מדיח|מכונת|ארון|מגירות|מיקרו|אסלה|קמין/
const MARK = /חזית|חתך|קנ"מ|^[NSEW]$|^[A-Zא-ת]-?\d+$|^\d+-\d+$/

/** What each layer holds, from its name. Offices that name layers by pen (008, 020, 050 …) cut their walls with the heaviest one. */
export function cadRoles(cad: Cad, given: Record<string, CadRole> = {}): Record<string, CadRole> {
  const out: Record<string, CadRole> = {}
  const count = new Map<string, number>()
  for (const l of cad.lines) count.set(l.layer, (count.get(l.layer) ?? 0) + 1)
  const names = new Set([...cad.layers, ...cad.texts.map(t => t.layer)])
  for (const name of names) {
    const n = name.toLowerCase()
    out[name] = /wall|קיר|^kir/.test(n) ? 'wall'
      : /עמוד|column|^col/.test(n) ? 'column'
      : /door|window|^win|דלת|חלון|פתח/.test(n) ? 'opening'
      : /dim|מיד|מפלס|level/.test(n) ? 'dim'
      : /text|txt|כיתוב|טקסט|remark/.test(n) ? 'text'
      : IGNORE.test(n) ? 'ignore'
      : 'other'
  }
  if (!Object.values(out).includes('wall')) {
    const pens = [...names].filter(n => /^\d{3}$/.test(n) && Number(n) <= 100 && (count.get(n) ?? 0) >= 40).sort((a, b) => Number(b) - Number(a))
    if (pens.length) out[pens[0]] = 'wall'
    else {
      // no naming convention at all: the layer whose lines most often run in wall-thick parallel pairs
      const best = [...names].filter(n => out[n] === 'other').map(n => ({ n, score: paired(cad.lines.filter(l => l.layer === n)) })).sort((a, b) => b.score - a.score)[0]
      if (best?.score) out[best.n] = 'wall'
    }
  }
  return { ...out, ...given }
}

/** Total length of axis-parallel segments that have a partner 7–45 units away overlapping at least 50 units (cm drawings). */
function paired(lines: CadLine[]): number {
  const segs: Array<{ o: 0 | 1; at: number; lo: number; hi: number }> = []
  for (const l of lines) for (let i = 0; i + 1 < l.pts.length; i++) {
    const a = l.pts[i], b = l.pts[i + 1], dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1])
    if (dy < .5 && dx > 50) segs.push({ o: 0, at: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) })
    else if (dx < .5 && dy > 50) segs.push({ o: 1, at: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) })
  }
  if (segs.length > 6000) segs.length = 6000
  let total = 0
  for (const s of segs) if (segs.some(t => t !== s && t.o === s.o && Math.abs(t.at - s.at) >= 7 && Math.abs(t.at - s.at) <= 45 && Math.min(t.hi, s.hi) - Math.max(t.lo, s.lo) >= 50)) total += s.hi - s.lo
  return total
}

interface Raw { storey: number; title: string; scale: number | null; region: Box; wall: Pt[][]; column: Pt[][]; door: CadLine[]; other: Array<{ l: CadLine; pts: Pt[] }>; texts: Array<{ text: string; at: Pt; h: number; span: number; rot: number }>; axis: number | null }

export function understandCad(cad: Cad, opts: CadOptions = {}): Plan {
  const warnings: string[] = []
  const roles = cadRoles(cad, opts.roles)
  const wallLayers = Object.keys(roles).filter(n => roles[n] === 'wall')
  if (!wallLayers.length) throw new Error('no wall layer found in the drawing')
  const wallLines = cad.lines.filter(l => roles[l.layer] === 'wall')
  // drawing units → cm
  const lens = wallLines.flatMap(l => l.pts.slice(1).map((p, i) => Math.hypot(p[0] - l.pts[i][0], p[1] - l.pts[i][1]))).filter(v => v > 0).sort((a, b) => a - b)
  const median = lens[Math.floor(lens.length / 2)] ?? 100
  const u = cad.units === 4 ? .1 : cad.units === 5 ? 1 : cad.units === 6 ? 100 : cad.units === 1 ? 2.54 : median > 600 ? .1 : median < 6 ? 100 : 1
  if (!cad.units) warnings.push(`the drawing does not state its units; read as ${u === 1 ? 'centimetres' : u === .1 ? 'millimetres' : 'metres'}`)
  const px = (p: readonly number[]): Pt => [p[0] * u * K, -p[1] * u * K]                 // y down, like every plan here

  // 1. drawings: wall lines that sit together
  const clusters = clusterLines(wallLines.map(l => l.pts.map(px)), 150)
  if (!clusters.length) throw new Error('no wall drawings found')
  // 2. the floor plans among them: the ones a plan title is written at
  const titles = cad.texts.filter(t => TITLE.test(t.text) && !ROOF.test(t.text) && STOREY_WORDS.some(([re]) => re.test(t.text)))
  const picked = new Map<number, { storey: number; title: string; scale: number | null; d: number }>()
  for (const t of titles) {
    const s0 = px(t.at), p: Pt = [s0[0] + t.span * u * K / 2, s0[1]], storey = STOREY_WORDS.find(([re]) => re.test(t.text))![1]
    // the drawing the title is written at: the largest one within reach (a fence or a legend may be nearer)
    const near = clusters.map((c, i) => ({ i, c, d: Math.max(0, c.box[0] - p[0], p[0] - c.box[2]) + Math.max(0, c.box[1] - p[1], p[1] - c.box[3]) })).filter(x => x.d <= 900).sort((a, b) => b.c.length - a.c.length)[0]
    if (!near) continue
    const scale = Number(/1:(\d+)/.exec(t.text)?.[1]) || null
    const had = picked.get(near.i)
    if (!had || near.d < had.d) picked.set(near.i, { storey, title: t.text, scale, d: near.d })
  }
  if (!picked.size) {
    warnings.push('no floor-plan titles found; the largest drawings are taken as storeys, right to left')
    const big = clusters.map((c, i) => ({ i, c })).sort((a, b) => b.c.length - a.c.length).slice(0, 3).sort((a, b) => b.c.box[0] - a.c.box[0])
    big.forEach((b, s) => picked.set(b.i, { storey: s, title: '', scale: null, d: 0 }))
  }
  if (process.env.CAD_DEBUG) { console.log('clusters', clusters.map(c => `${Math.round(c.length)}:[${c.box.map(Math.round)}]`).join(' ')); console.log('titles', titles.map(t => `${t.text}@${px(t.at).map(Math.round)}`), [...picked]) }
  // one drawing per storey (a site plan repeats the ground floor: the title decides)
  const byStorey = new Map<number, number>()
  for (const [i, v] of picked) { const had = byStorey.get(v.storey); if (had === undefined || picked.get(had)!.d > v.d) byStorey.set(v.storey, i) }
  const low = Math.min(...byStorey.keys())

  // 3. everything drawn on each plan, in px
  const raws: Raw[] = []
  for (const [storey, ci] of [...byStorey].sort((a, b) => a[0] - b[0])) {
    const c = clusters[ci], m = 200 * K, region: Box = [c.box[0] - m, c.box[1] - m, c.box[2] + m, c.box[3] + m]
    const inside = (pts: Pt[]) => pts.every(p => p[0] >= region[0] && p[0] <= region[2] && p[1] >= region[1] && p[1] <= region[3])
    const raw: Raw = { storey: storey - Math.min(0, low), title: picked.get(ci)!.title, scale: picked.get(ci)!.scale, region, wall: [], column: [], door: [], other: [], texts: [], axis: null }
    for (const l of cad.lines) {
      const role = roles[l.layer]; if (role === 'ignore' || role === 'text' || role === 'dim') continue
      const pts = l.pts.map(px); if (!inside(pts)) continue
      const ring = l.closed && !l.curved ? [...pts, pts[0]] : pts
      if (role === 'wall') raw.wall.push(ring)
      else if (role === 'column') raw.column.push(ring)
      else if (role === 'opening') raw.door.push({ ...l, pts: ring, closed: false })
      else raw.other.push({ l, pts })
    }
    for (const t of cad.texts) { const p = px(t.at); if (inside([p]) && roles[t.layer] !== 'ignore' && roles[t.layer] !== 'dim') raw.texts.push({ text: t.text, at: p, h: t.height * u * K, span: t.span * u * K, rot: t.rotation }) }
    raw.axis = mirror(raw.wall)
    raws.push(raw)
  }

  // 4. each storey's unit, walls and openings; storeys aligned on their wall corners (the top one is the reference)
  const want = opts.unit ?? 'left'
  type Built = { raw: Raw; side: 'left' | 'right' | 'whole'; walls: Poly[]; ops: Opening[]; dx: number; dy: number; match: number }
  const built: Built[] = []
  for (let k = raws.length - 1; k >= 0; k--) {
    const raw = raws[k]
    const whole = wallsOf(raw)
    const sides: Array<'left' | 'right' | 'whole'> = raw.axis === null ? ['whole'] : [want, want === 'left' ? 'right' : 'left']
    const unit = (side: 'left' | 'right' | 'whole') => (side === 'whole' ? whole.walls : whole.walls.map(p => clipX(p, raw.axis!, side)).filter(p => p.length))
    if (k === raws.length - 1) { const walls = unit(sides[0]), b = bbox(walls); built.unshift({ raw, side: sides[0], walls, ops: whole.ops, dx: -(b[0] - 10), dy: -(b[1] - 10), match: 1 }); continue }
    const above = built[0], ref = above.walls.flat().map(([x, y]): Pt => [x + above.dx, y + above.dy])
    const best = sides.map(side => { const walls = unit(side); return { side, walls, fit: shiftTo(ref, walls.flat()) } }).sort((a, b) => b.fit.match - a.fit.match)[0]
    if (best.fit.match < .1) warnings.push(`storey ${raw.storey} lines up poorly with the storey above (${Math.round(best.fit.match * 100)}% of corners)`)
    built.unshift({ raw, side: best.side, walls: best.walls, ops: whole.ops, dx: best.fit.dx, dy: best.fit.dy, match: best.fit.match })
  }

  const storeys: PlanStorey[] = []
  built.forEach((b, n) => {
    const { raw, dx, dy } = b, mv = ([x, y]: Pt): Pt => [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10]
    const mine = (x: number) => raw.axis === null || (b.side === 'left' ? x <= raw.axis + 1 : x >= raw.axis - 1)
    const walls = b.walls.map(p => p.map(mv))
    const wb = bbox(walls), near = (p: Pt, m: number) => p[0] > wb[0] - m && p[0] < wb[2] + m && p[1] > wb[1] - m && p[1] < wb[3] + m
    const ops = b.ops.filter(o => mine((o.box[0] + o.box[2]) / 2)).map(o => moveOp(o, dx, dy))
    const reach = .8 * Math.max(wb[2] - wb[0], wb[3] - wb[1])
    const strokes: Stroke[] = [], pieces = new Map<number, Instance>()
    for (const { l, pts } of raw.other) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length; if (!mine(cx)) continue
      const q = pts.map(mv); if (!q.every(p => near(p, 150))) continue
      if (!l.curved && q.length === 2 && Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) > reach) continue      // section and axis lines
      const pen = /^\d{3}$/.test(l.layer) ? Number(l.layer) / 100 * 2.835 : .5
      strokes.push({ pts: q, width: pen, dashed: l.dashed, curved: l.curved, closed: l.closed, layer: l.layer })
      if (l.inst !== undefined) {                                       // one placed block = one piece
        const it = pieces.get(l.inst) ?? { name: cad.inserts[l.inst]?.name ?? '', layer: l.layer, box: [Infinity, Infinity, -Infinity, -Infinity] as Box, curved: 0, parts: 0 }
        for (const [x, y] of q) { if (x < it.box[0]) it.box[0] = x; if (y < it.box[1]) it.box[1] = y; if (x > it.box[2]) it.box[2] = x; if (y > it.box[3]) it.box[3] = y }
        it.parts++; if (l.curved) it.curved++
        pieces.set(l.inst, it)
      }
    }
    const labels = raw.texts.filter(t => mine(t.at[0]) && !MARK.test(t.text) && !TITLE.test(t.text) && !/^[-+±\d.,:=xX/ ]*$/.test(t.text)).map(t => {
      const text = expand(t.text), p = mv(t.at), a = Math.min(0, t.span), b = Math.max(0, t.span)
      const box: Box = Math.abs(Math.sin(t.rot)) > .7 ? [p[0] - t.h, p[1] - b, p[0], p[1] - a] : [p[0] + a, p[1] - t.h, p[0] + b, p[1]]
      const kind = /בשטח|מ"ר/.test(text) ? 'note' as const : FIXTURE.test(text) ? 'fixture' as const : ROOM.test(text) ? 'room' as const : 'note' as const
      return { text, kind, box, size: t.h }
    }).filter(l => near([(l.box[0] + l.box[2]) / 2, (l.box[1] + l.box[3]) / 2], 400))

    // doors nobody drew a swing for: door-wide gaps between wall ends. Tried first, kept where a room is behind one side.
    const gaps = gapDoors(walls, ops, strokes)
    let r = analyse(walls, [...ops, ...gaps].map(o => ({ ...o })), strokes, labels)
    const roomAt = (x: number, y: number) => r.rooms.find(room => room.tiles.some(t => x >= t[0] && x < t[2] && y >= t[1] && y < t[3]))
    const real = gaps.filter(o => {
      const mid = (o.from + o.to) / 2, off = (o.axis === 'h' ? o.box[3] - o.box[1] : o.box[2] - o.box[0]) / 2 + 30
      const sides = o.axis === 'h' ? [roomAt(mid, o.at - off), roomAt(mid, o.at + off)] : [roomAt(o.at - off, mid), roomAt(o.at + off, mid)]
      return sides.some(s => s && !s.outdoor)
    })
    // lines that only look like a wall body (a boundary fence and a paving edge running side by side) stand away from every room
    const floor: Box[] = [...r.rooms.filter(room => !room.outdoor).flatMap(room => room.tiles), ...r.stairs.map(st => st.box)]
    const far = (p: Poly, m: number) => { const [a, c] = [p[0], p[2]]; return !floor.some(t => Math.max(0, t[0] - c[0], a[0] - t[2]) <= m && Math.max(0, t[1] - c[1], a[1] - t[3]) <= m) }
    const keep = new Set(walls.filter(p => !far(p, 50)))
    for (const p of walls) if (!keep.has(p) && Math.max(p[2][0] - p[0][0], p[2][1] - p[0][1]) <= 260 && [...keep].some(q => Math.max(0, q[0][0] - p[2][0], p[0][0] - q[2][0]) <= 3 && Math.max(0, q[0][1] - p[2][1], p[0][1] - q[2][1]) <= 3)) keep.add(p)
    const dropped = walls.length - keep.size
    if (dropped) walls.splice(0, walls.length, ...walls.filter(p => keep.has(p)))
    if (dropped || real.length !== gaps.length) r = analyse(walls, [...ops, ...real].map(o => ({ ...o })), strokes, labels)
    for (const room of r.rooms) if (/חלל כפול/.test(room.name)) room.void = true
    if (real.length) warnings.push(`storey ${raw.storey}: ${real.length} doors are read from gaps in the walls (no swing is drawn); which way they open is not known`)
    const things = cadThings([...pieces.values()], r.rooms, walls, r.openings, strokes)
    if (process.env.CAD_DEBUG) for (const it of pieces.values()) { const c = [(it.box[0] + it.box[2]) / 2, (it.box[1] + it.box[3]) / 2], room = r.rooms.find(q => q.tiles.some(t => c[0] >= t[0] && c[0] < t[2] && c[1] >= t[1] && c[1] < t[3])); console.log('piece', raw.storey, it.name.padEnd(14), it.layer.padEnd(5), `${Math.round(it.box[2] - it.box[0])}x${Math.round(it.box[3] - it.box[1])}`.padEnd(9), 'parts', it.parts, 'curved', it.curved, '|', room?.name ?? '-') }
    const [x1, y1, x2, y2] = wb
    storeys.push({ storey: raw.storey, name: STOREY_NAMES[raw.storey + Math.min(0, low)] ?? `קומה ${raw.storey}`, title: raw.title || null, drawing: n, side: b.side, place: { sx: 1, dx: Math.round(dx), dy: Math.round(dy) }, match: +b.match.toFixed(3), party: raw.axis === null ? null : Math.round(raw.axis + dx), bounds: [Math.round(x1 - 30), Math.round(y1 - 30), Math.round(x2 + 30), Math.round(y2 + 30)], walls, rooms: r.rooms, openings: r.openings, notes: r.notes, stairs: r.stairs, railings: r.railings, strokes, things })
  })
  const written = raws.map(r => r.scale).find(v => v) ?? null
  const heights = heightsOf(cad, raws, px)
  if (heights.note) warnings.push(heights.note)
  return { format: 'plan@1', scale: { ptPerCm: 72 / 2.54 / (written ?? 100), pxPerPt: K / (72 / 2.54 / (written ?? 100)), from: 'drawing', dimensions: 0, agree: 0, written }, ...(heights.value ? { heights: heights.value } : {}), storeys, warnings }
}

/**
 * Heights as the drawing states them: the clear ceiling from the note on the sections ("גובה תקרה נטו H=+270"), the
 * floor-to-floor from the level mark written most often on the storey above the ground ("+312").
 */
function heightsOf(cad: Cad, raws: Raw[], px: (p: readonly number[]) => Pt): { value?: { ceiling: number; storey: number }; note?: string } {
  const ceilings = cad.texts.map(t => /תקרה נטו[^\d]*?(\d{3})(?!\d)/.exec(t.text)?.[1]).filter(Boolean).map(Number).filter(v => v >= 230 && v <= 400)
  let ceiling = ceilings.length ? Math.max(...ceilings) / 100 : null                    // a shelter's lower ceiling is noted too: the house's is the higher
  let storey: number | null = null
  const up = raws.find(r => r.storey === raws[0].storey + 1)
  if (up) {
    const votes = new Map<number, number>()
    for (const t of cad.texts) {
      const m = /^\+\s?(\d{3}|\d\.\d{2})$/.exec(t.text.trim()); if (!m) continue
      const p = px(t.at); if (p[0] < up.region[0] || p[0] > up.region[2] || p[1] < up.region[1] || p[1] > up.region[3]) continue
      const cm = m[1].includes('.') ? Math.round(Number(m[1]) * 100) : Number(m[1])
      if (cm >= 250 && cm <= 420) votes.set(cm, (votes.get(cm) ?? 0) + 1)
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] >= 2) storey = best[0] / 100
  }
  if (ceiling !== null && storey !== null && (storey - ceiling < .15 || storey - ceiling > .7)) storey = null      // not a floor level after all
  if (ceiling === null && storey === null) return { note: 'the drawing states no ceiling height or floor levels; 2.80 m under a 25 cm slab is assumed' }
  if (ceiling === null) return { value: { ceiling: Math.round((storey! - .35) * 100) / 100, storey: storey! }, note: `floor-to-floor ${storey!.toFixed(2)} m is read from the level marks; the clear ceiling is taken 35 cm less` }
  if (storey === null) return { value: { ceiling, storey: Math.round((ceiling + .3) * 100) / 100 }, note: `the clear ceiling ${ceiling.toFixed(2)} m is read from the sections; floor-to-floor is taken 30 cm more` }
  return { value: { ceiling, storey } }
}

/** Abbreviations architects write, spelled out (the room rules read the words). */
const expand = (t: string) => t.replace(/^מ"(?=[א-ת])/, 'מרפסת ').replace(/^ח"(?=[א-ת])/, 'חדר ').replace(/^פ"(?=[א-ת])/, 'פינת ').replace(/-ח"(?=[א-ת])/, ' - חדר ').replace(/\s+/g, ' ').trim()

function moveOp(o: Opening, dx: number, dy: number): Opening {
  const a = o.axis === 'h' ? dx : dy, c = o.axis === 'h' ? dy : dx, mv = (p: Pt): Pt => [p[0] + dx, p[1] + dy]
  return { ...o, box: [o.box[0] + dx, o.box[1] + dy, o.box[2] + dx, o.box[3] + dy], from: o.from + a, to: o.to + a, at: o.at + c, hinge: o.hinge && mv(o.hinge), ends: o.ends && [mv(o.ends[0]), mv(o.ends[1])] }
}

/** Groups of polylines whose points lie within `gap` px of each other (a coarse grid, 8-connected). */
function clusterLines(lines: Pt[][], gap: number): Array<{ box: Box; length: number }> {
  const cells = new Map<string, number>(), parent: number[] = []
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const idOf = (gx: number, gy: number) => { const k = gx + ',' + gy; let id = cells.get(k); if (id === undefined) { id = parent.length; parent.push(id); cells.set(k, id); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const o = cells.get((gx + i) + ',' + (gy + j)); if (o !== undefined) parent[find(o)] = find(id) } } return id }
  const first: number[] = []
  for (const l of lines) {
    let id = -1
    for (let i = 0; i + 1 < l.length; i++) {
      const a = l[i], b = l[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (gap / 2)))
      for (let t = 0; t <= n; t++) { const c = idOf(Math.floor((a[0] + (b[0] - a[0]) * t / n) / gap), Math.floor((a[1] + (b[1] - a[1]) * t / n) / gap)); if (id < 0) id = c; else parent[find(c)] = find(id) }
    }
    first.push(id)
  }
  const groups = new Map<number, { box: Box; length: number }>()
  lines.forEach((l, n) => {
    if (first[n] < 0) return
    const r = find(first[n]), g = groups.get(r) ?? { box: [Infinity, Infinity, -Infinity, -Infinity] as Box, length: 0 }
    for (let i = 0; i < l.length; i++) { const [x, y] = l[i]; if (x < g.box[0]) g.box[0] = x; if (y < g.box[1]) g.box[1] = y; if (x > g.box[2]) g.box[2] = x; if (y > g.box[3]) g.box[3] = y; if (i) g.length += Math.hypot(x - l[i - 1][0], y - l[i - 1][1]) }
    groups.set(r, g)
  })
  // pieces of one drawing that stand a little apart (a boundary wall above the plan) belong together
  const all = [...groups.values()]
  for (let merged = true; merged;) {
    merged = false
    for (let i = 0; i < all.length && !merged; i++) for (let k = i + 1; k < all.length && !merged; k++) {
      const a = all[i].box, b = all[k].box
      if (Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]), Math.max(a[1], b[1]) - Math.min(a[3], b[3])) > 2 * gap) continue
      all[i] = { box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], length: all[i].length + all[k].length }
      all.splice(k, 1); merged = true
    }
  }
  const most = Math.max(...all.map(g => g.length))
  return all.filter(g => g.length > .1 * most)
}

/** x of the party wall when the wall lines are a mirror image of themselves (a twin house); null otherwise. */
function mirror(wall: Pt[][]): number | null {
  const vert: Array<{ x: number; lo: number; hi: number }> = []
  for (const l of wall) for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1]; if (Math.abs(a[0] - b[0]) < .5 && Math.abs(a[1] - b[1]) >= 30) vert.push({ x: (a[0] + b[0]) / 2, lo: Math.round(Math.min(a[1], b[1])), hi: Math.round(Math.max(a[1], b[1])) }) }
  if (vert.length < 12) return null
  const byKey = new Map<string, number[]>()
  for (const v of vert) { const k = v.lo + ':' + v.hi; byKey.set(k, [...(byKey.get(k) ?? []), v.x]) }
  const votes = new Map<number, number>()
  for (const xs of byKey.values()) for (let i = 0; i < xs.length; i++) for (let k = i + 1; k < xs.length; k++) if (Math.abs(xs[i] - xs[k]) > 50) { const m = Math.round((xs[i] + xs[k]) / 2); votes.set(m, (votes.get(m) ?? 0) + 1) }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0]
  if (!best) return null
  const support = [-1, 0, 1].reduce((s, d) => s + (votes.get(best[0] + d) ?? 0), 0)
  if (2 * support < .5 * vert.length) return null
  // the exact axis: mean of the midpoints that voted
  let sum = 0, n = 0
  for (const xs of byKey.values()) for (let i = 0; i < xs.length; i++) for (let k = i + 1; k < xs.length; k++) { const m = (xs[i] + xs[k]) / 2; if (Math.abs(xs[i] - xs[k]) > 50 && Math.abs(m - best[0]) <= 1) { sum += m; n++ } }
  return sum / n
}

/** The shift that lays the most corners of `pts` on the reference corners, and the share of them that then coincide. */
function shiftTo(ref: Pt[], pts: Pt[], tol = 4): { dx: number; dy: number; match: number } {
  const votes = new Map<string, number>()
  for (const [x, y] of pts) for (const [rx, ry] of ref) { const k = Math.round((rx - x) / tol) + ',' + Math.round((ry - y) / tol); votes.set(k, (votes.get(k) ?? 0) + 1) }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0]
  if (!best) return { dx: 0, dy: 0, match: 0 }
  const [kx, ky] = best[0].split(',').map(Number)
  let sx = 0, sy = 0, m = 0
  for (const [x, y] of pts) for (const [rx, ry] of ref) { const ex = rx - x - kx * tol, ey = ry - y - ky * tol; if (Math.abs(ex) <= tol && Math.abs(ey) <= tol) { sx += ex; sy += ey; m++ } }
  return { dx: kx * tol + (m ? sx / m : 0), dy: ky * tol + (m ? sy / m : 0), match: Math.min(1, best[1] / pts.length) }
}

/**
 * Walls as rectangles: rasterise the wall lines, find where a 46 cm square of free floor fits, and what is left —
 * the narrow bodies between two wall faces, columns, small closed shafts — is wall. Window symbols are cut out of it.
 */
function wallsOf(raw: Raw): { walls: Poly[]; ops: Opening[] } {
  // windows and drawn doors, through the same reader the PDF path uses (it measures in page points: 1 pt = S px)
  const S = 3.5
  const fake = { width: 0, height: 0, layers: ['door'], paths: raw.door.map(l => ({ layer: 'door', paint: 'stroke', stroke: '#000000', fill: '#000000', width: 1, dashed: l.dashed, subs: [{ points: l.pts.map(([x, y]): Pt => [x / S, y / S]), closed: false, curved: l.curved }] })) } as PdfLayers
  const ops = readOpenings(fake, { door: 'door' }).openings.map((o): Opening => ({ ...o, box: o.box.map(v => v * S) as Box, from: o.from * S, to: o.to * S, at: o.at * S, hinge: o.hinge && [o.hinge[0] * S, o.hinge[1] * S], ends: o.ends && [[o.ends[0][0] * S, o.ends[0][1] * S], [o.ends[1][0] * S, o.ends[1][1] * S]] }))

  // wall faces, columns, and the window symbols themselves (some offices break the wall lines at a window)
  const inGlass = (l: Pt[]) => ops.some(o => o.kind === 'glazing' && l.every(([x, y]) => x >= o.box[0] - 2 && x <= o.box[2] + 2 && y >= o.box[1] - 2 && y <= o.box[3] + 2))
  const lines = [...raw.wall, ...raw.column, ...raw.door.filter(l => !l.curved).map(l => l.pts as Pt[]).filter(inGlass)]
  const g = Grid.around([...raw.wall, ...raw.column], CELL, 120), { w, h } = g
  const cell = (x: number, y: number) => { const i = Math.floor((x - g.ox) / CELL), j = Math.floor((y - g.oy) / CELL); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i }
  const bar = new Uint8Array(w * h)
  for (const l of lines) for (let i = 0; i + 1 < l.length; i++) {
    const a = l[i], b = l[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * .5)))
    for (let t = 0; t <= n; t++) { const k = cell(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n); if (k >= 0) bar[k] = 1 }
  }
  // opening of the free space with a ROOMY square: erode, then dilate (summed-area tables)
  const r = (ROOMY - 1) / 2
  const eroded = windowSum(bar, w, h, r).map(v => (v === 0 ? 1 : 0))
  const roomy = windowSum(eroded, w, h, r).map(v => (v > 0 ? 1 : 0))
  const thin = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) thin[k] = roomy[k] ? 0 : 1
  // small closed boxes (shafts, ducts) are solid too
  const spaces = components(g, k => roomy[k] === 1 && !bar[k])
  const edge = new Set<number>(); for (let i = 0; i < w; i++) { edge.add(spaces.lab.a[i]); edge.add(spaces.lab.a[(h - 1) * w + i]) } for (let j = 0; j < h; j++) { edge.add(spaces.lab.a[j * w]); edge.add(spaces.lab.a[j * w + w - 1]) }
  const solid = new Set<number>(); spaces.sizes.forEach((n, id) => { if (id && !edge.has(id) && n * (CELL / PX_PER_M) ** 2 < 1) solid.add(id) })
  for (let k = 0; k < w * h; k++) if (solid.has(spaces.lab.a[k])) thin[k] = 1
  // a lone line is not a wall: keep what is at least 3 cells (6 cm) thick
  const core = windowSum(thin, w, h, 1).map(v => (v === 9 ? 1 : 0))
  const body = windowSum(core, w, h, 1).map(v => (v > 0 ? 1 : 0))
  for (let k = 0; k < w * h; k++) if (!thin[k]) body[k] = 0

  // cut the windows out, through the whole thickness of the wall they sit in
  const cuts: number[][] = [[], []]                                    // x cuts, y cuts: where openings end, for snapping
  for (const o of ops) {
    if (o.kind !== 'glazing') continue
    const hz = o.axis === 'h', lo = hz ? o.box[1] : o.box[0], hi = hz ? o.box[3] : o.box[2]
    let wLo = Infinity, wHi = -Infinity
    for (let v = o.from + CELL / 2; v < o.to; v += CELL) {
      const at = (c: number) => (hz ? cell(v, c) : cell(c, v))
      let a = lo, b = hi
      for (let t = 0; t < 26 && at(a - CELL) >= 0 && body[at(a - CELL)]; t++) a -= CELL
      for (let t = 0; t < 26 && at(b + CELL) >= 0 && body[at(b + CELL)]; t++) b += CELL
      for (let c = a; c <= b; c += CELL) { const k = at(c); if (k >= 0 && body[k]) { body[k] = 0; if (c < wLo) wLo = c; if (c > wHi) wHi = c } }
    }
    if (wHi > wLo) {                                                   // the glass stands in the wall, not on its sill
      const a = Math.floor(wLo / CELL) * CELL, b = Math.floor(wHi / CELL) * CELL + CELL
      o.at = (a + b) / 2; if (hz) { o.box[1] = a; o.box[3] = b } else { o.box[0] = a; o.box[2] = b }
    }
    cuts[hz ? 0 : 1].push(o.from, o.to)
  }

  // rectangles: runs along x, stacked while they repeat
  const rects: Box[] = [], open = new Map<string, Box>()
  for (let j = 0; j <= h; j++) {
    const seen = new Set<string>()
    for (let i = 0; i < w && j < h;) {
      if (!body[j * w + i]) { i++; continue }
      let e = i; while (e < w && body[j * w + e]) e++
      const key = i + ':' + e; seen.add(key)
      const b = open.get(key); if (b) b[3] = j + 1; else open.set(key, [i, j, e, j + 1])
      i = e
    }
    for (const [key, b] of open) if (!seen.has(key)) { rects.push(b); open.delete(key) }
  }
  // faces back onto the drawn lines (the raster is 2 px; the drawing is exact)
  const xs: number[] = [...cuts[0]], ys: number[] = [...cuts[1]]
  for (const l of [...raw.wall, ...raw.column]) for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1]; if (Math.abs(a[0] - b[0]) < .3) xs.push(a[0]); if (Math.abs(a[1] - b[1]) < .3) ys.push(a[1]) }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
  const snap = (v: number, to: number[]) => { let lo = 0, hi = to.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (to[m] < v) lo = m + 1; else hi = m } let best = v, d = 2.3; for (const c of [to[lo - 1], to[lo]]) if (c !== undefined && Math.abs(c - v) < d) { d = Math.abs(c - v); best = c } return best }
  const walls: Poly[] = []
  for (const b of rects) {
    const x1 = snap(g.ox + b[0] * CELL, xs), y1 = snap(g.oy + b[1] * CELL, ys), x2 = snap(g.ox + b[2] * CELL, xs), y2 = snap(g.oy + b[3] * CELL, ys)
    if (x2 - x1 < 1 || y2 - y1 < 1) continue
    walls.push([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
  }
  return { walls, ops }
}

/** Sum of `a` over the (2r+1)² window around each cell (cells outside count 0). */
function windowSum(a: ArrayLike<number>, w: number, h: number, r: number): Int32Array {
  const sat = new Int32Array((w + 1) * (h + 1))
  for (let j = 0; j < h; j++) { let row = 0; for (let i = 0; i < w; i++) { row += a[j * w + i]; sat[(j + 1) * (w + 1) + i + 1] = sat[j * (w + 1) + i + 1] + row } }
  const out = new Int32Array(w * h)
  for (let j = 0; j < h; j++) { const j1 = Math.max(0, j - r), j2 = Math.min(h, j + r + 1); for (let i = 0; i < w; i++) { const i1 = Math.max(0, i - r), i2 = Math.min(w, i + r + 1); out[j * w + i] = sat[j2 * (w + 1) + i2] - sat[j1 * (w + 1) + i2] - sat[j2 * (w + 1) + i1] + sat[j1 * (w + 1) + i1] } }
  return out
}

/**
 * Door-wide gaps: a wall end with free floor in front of it and wall again 60–128 px on, straight ahead. Up to a metre
 * that is a doorway; wider ones count only when a threshold line is drawn across the gap.
 */
function gapDoors(walls: Poly[], ops: Opening[], strokes: Stroke[]): Opening[] {
  if (!walls.length) return []
  const g = Grid.around(walls, CELL, 140)
  for (const p of walls) g.fill(p, 1)
  const wallAt = (x: number, y: number) => g.get(Math.floor((x - g.ox) / CELL), Math.floor((y - g.oy) / CELL)) === 1
  const out: Opening[] = []
  const taken = (b: Box) => [...ops, ...out].some(o => Math.min(o.box[2], b[2]) - Math.max(o.box[0], b[0]) > -6 && Math.min(o.box[3], b[3]) - Math.max(o.box[1], b[1]) > -6)
  const threshold = (hz: boolean, from: number, to: number, lo: number, hi: number) => strokes.some(s => !s.curved && s.pts.some((a, i) => { const b = s.pts[i + 1]; if (!b) return false; const along = hz ? [a[0], b[0]] : [a[1], b[1]], across = hz ? [a[1], b[1]] : [a[0], b[0]]; return Math.abs(across[0] - across[1]) < 1 && across[0] > lo - 4 && across[0] < hi + 4 && Math.min(...along) <= from + .15 * (to - from) && Math.max(...along) >= to - .15 * (to - from) }))
  for (const p of walls) {
    const [x1, y1] = p[0], [x2, y2] = p[2]
    for (const hz of [true, false]) {
      const thick = hz ? y2 - y1 : x2 - x1, long = hz ? x2 - x1 : y2 - y1
      if (thick < 6 || thick > 46 || long < 6) continue
      const lo = hz ? y1 : x1, hi = hz ? y2 : x2, mid = (lo + hi) / 2
      for (const dir of [1, -1]) {
        const tip = dir > 0 ? (hz ? x2 : y2) : (hz ? x1 : y1)
        const at = (t: number, c: number) => (hz ? wallAt(tip + dir * t, c) : wallAt(c, tip + dir * t))
        const rows = [lo + 2, mid, hi - 2]
        if (rows.some(c => at(3, c))) continue                                                            // not a free end
        let gap = 0
        for (let t = 5; t <= 130; t += CELL) if (at(t, mid)) { gap = t - 1; break }
        if (gap < 58 || gap > 128) continue
        let clear = true
        for (let t = 5; t < gap - 3 && clear; t += CELL) if (rows.some(c => at(t, c))) clear = false
        if (!clear) continue
        const from = Math.min(tip, tip + dir * gap), to = Math.max(tip, tip + dir * gap)
        if (gap > 100 && !threshold(hz, from, to, lo, hi)) continue
        const box: Box = hz ? [from, lo, to, hi] : [lo, from, hi, to]
        if (taken(box)) continue
        out.push({ kind: 'door', box, axis: hz ? 'h' : 'v', from, to, at: mid })
      }
    }
  }
  return out
}
