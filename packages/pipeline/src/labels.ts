import { createCanvas } from '@napi-rs/canvas'
import type { Path, PdfLayers, Pt } from './pdf'

/**
 * Written things on the sheet. CAD exports text as strokes, so nothing here is a string yet: a Label is a tight
 * group of strokes with its box and reading direction. read.ts turns the picture of each label into text.
 */
export type Box = [number, number, number, number]
export interface Label {
  id: number
  kind: 'text' | 'dim'
  box: Box                          // page points
  /** 'h' reads left→right, 'v' is turned a quarter (drafting convention: reads bottom→top) */
  dir: 'h' | 'v'
  strokes: Pt[][]
  text?: string                     // filled in by read.ts
}
/** A dimension line: the long stroke a measurement is written along. */
export interface DimLine { a: Pt; b: Pt }

export type Role = 'wall' | 'text' | 'dim' | 'door' | 'furniture' | 'planting' | 'other'

/** What a CAD layer holds, from its name and what is drawn on it. Unknown layers stay 'other' (still kept). */
export function layerRoles(L: PdfLayers): Record<string, Role> {
  const out: Record<string, Role> = {}
  // walls: the layer with the largest saturated filled area
  const fillArea = new Map<string, number>()
  for (const p of L.paths) {
    if (p.paint === 'stroke') continue
    const c = p.fill, r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16)
    if (Math.max(r, g, b) - Math.min(r, g, b) < 60) continue
    let a = 0; for (const s of p.subs) a += polyArea(s.points)
    fillArea.set(p.layer, (fillArea.get(p.layer) ?? 0) + a)
  }
  const wall = [...fillArea].sort((a, b) => b[1] - a[1])[0]?.[0]
  for (const name of L.layers) {
    const n = name.toLowerCase()
    out[name] = name === wall ? 'wall'
      : /dim|מיד/.test(n) ? 'dim'
      : /text|txt|remark|טקסט|כיתוב/.test(n) ? 'text'
      : /door|window|דלת|חלון/.test(n) ? 'door'
      : /shrub|tree|plant|צמח|עץ/.test(n) ? 'planting'
      : /furn|רהיט|ריהוט/.test(n) ? 'furniture'
      : 'other'
  }
  return out
}

const polyArea = (p: Pt[]) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2) }
const boxOf = (ss: Pt[][]): Box => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const s of ss) for (const [x, y] of s) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y } return [x1, y1, x2, y2] }
const gap = (a: Box, b: Box) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]), Math.max(a[1], b[1]) - Math.min(a[3], b[3]))

/** Union–find grouping of boxes closer than `near(a, b)`; a uniform grid keeps it linear. */
function group<T>(items: T[], box: (t: T) => Box, reach: number, near: (a: Box, b: Box) => boolean): T[][] {
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const cell = Math.max(reach * 2, 4), grid = new Map<string, number[]>()
  items.forEach((t, i) => {
    const b = box(t)
    for (let gx = Math.floor((b[0] - reach) / cell); gx <= Math.floor((b[2] + reach) / cell); gx++) for (let gy = Math.floor((b[1] - reach) / cell); gy <= Math.floor((b[3] + reach) / cell); gy++) {
      const k = gx + ',' + gy, arr = grid.get(k)
      if (arr) { for (const j of arr) if (find(i) !== find(j) && near(b, box(items[j]))) parent[find(i)] = find(j); arr.push(i) } else grid.set(k, [i])
    }
  })
  const groups = new Map<number, T[]>()
  items.forEach((t, i) => { const r = find(i); const g = groups.get(r); if (g) g.push(t); else groups.set(r, [t]) })
  return [...groups.values()]
}

/** Names and notes: every stroke group on the text layers. */
export function textLabels(L: PdfLayers, roles = layerRoles(L)): Label[] {
  const paths = L.paths.filter(p => roles[p.layer] === 'text')
  const items = paths.map(p => ({ strokes: p.subs.map(s => s.points), box: boxOf(p.subs.map(s => s.points)) })).filter(t => t.box[2] - t.box[0] < 400 && t.box[3] - t.box[1] < 400)
  // a word is usually one path; join pieces that sit on the same line a fraction of the letter height apart
  const h = (b: Box) => Math.min(b[2] - b[0], b[3] - b[1])
  const merged = group(items, t => t.box, 6, (a, b) => gap(a, b) <= .45 * Math.min(h(a), h(b)))
  return merged.map((g, i) => {
    const strokes = g.flatMap(t => t.strokes), box = boxOf(strokes)
    return { id: i, kind: 'text' as const, box, dir: box[3] - box[1] > 1.3 * (box[2] - box[0]) ? 'v' as const : 'h' as const, strokes }
  }).filter(l => Math.max(l.box[2] - l.box[0], l.box[3] - l.box[1]) > 2)
}

/** Dimension layer: the long lines measurements run along, and the small stroke groups that are the numbers. */
export function dimLabels(L: PdfLayers, roles = layerRoles(L)): { lines: DimLine[]; labels: Label[] } {
  const subs = L.paths.filter(p => roles[p.layer] === 'dim').flatMap(p => p.subs.map(s => s.points))
  const lines: DimLine[] = [], small: Array<{ pts: Pt[]; box: Box }> = []
  for (const s of subs) {
    const b = boxOf([s]), size = Math.max(b[2] - b[0], b[3] - b[1])
    if (size > 14 && s.length <= 3) lines.push({ a: s[0], b: s[s.length - 1] })
    else if (size <= 14) small.push({ pts: s, box: b })
  }
  // tick marks sit ON a dimension line (and cross it); digits sit beside it
  const onLine = (b: Box) => {
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    for (const { a, b: e } of lines) {
      const horiz = Math.abs(a[1] - e[1]) < .5, vert = Math.abs(a[0] - e[0]) < .5
      if (horiz && Math.abs(cy - a[1]) < .6 && cx > Math.min(a[0], e[0]) - 1 && cx < Math.max(a[0], e[0]) + 1) return true
      if (vert && Math.abs(cx - a[0]) < .6 && cy > Math.min(a[1], e[1]) - 1 && cy < Math.max(a[1], e[1]) + 1) return true
    }
    return false
  }
  const digits = small.filter(s => !onLine(s.box))
  // digits of one number sit closer together than half a digit; which way it reads comes from its dimension line
  const sizes = digits.map(d => Math.max(d.box[2] - d.box[0], d.box[3] - d.box[1])).sort((a, b) => a - b)
  const digit = sizes[Math.floor(sizes.length * .6)] || 4
  const groups = group(digits, t => t.box, digit, (a, b) => gap(a, b) <= .55 * digit)
  const labels: Label[] = []
  for (const g of groups) {
    const strokes = g.map(t => t.pts), box = boxOf(strokes), w = box[2] - box[0], hh = box[3] - box[1]
    if (Math.max(w, hh) < .6 * digit || Math.max(w, hh) > 8 * digit) continue
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2
    let best = Infinity, dir: 'h' | 'v' = hh > 1.15 * w ? 'v' : 'h'
    for (const { a, b } of lines) {
      const horiz = Math.abs(a[1] - b[1]) < .5, vert = Math.abs(a[0] - b[0]) < .5
      if (horiz && cx > Math.min(a[0], b[0]) - 2 && cx < Math.max(a[0], b[0]) + 2) { const d = Math.abs(cy - a[1]); if (d < best) { best = d; dir = 'h' } }
      if (vert && cy > Math.min(a[1], b[1]) - 2 && cy < Math.max(a[1], b[1]) + 2) { const d = Math.abs(cx - a[0]); if (d < best) { best = d; dir = 'v' } }
    }
    if (best > 3 * digit) continue                                   // not written along any dimension line
    labels.push({ id: labels.length, kind: 'dim', box, dir, strokes })
  }
  return { lines, labels }
}

/** A PNG of one label, upright (vertical labels are turned a quarter clockwise), letters `px` pixels tall. */
export function renderLabel(l: Label, px = 44, pad = 10): Buffer {
  const [x1, y1, x2, y2] = l.box, w = x2 - x1, h = y2 - y1
  const tall = l.dir === 'v' ? w : h, long = l.dir === 'v' ? h : w
  const s = px / Math.max(tall, .5)
  const W = Math.ceil(long * s + 2 * pad), H = Math.ceil(tall * s + 2 * pad)
  const c = createCanvas(W, H), g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H)
  g.strokeStyle = '#000'; g.lineWidth = Math.max(1.6, px / 22); g.lineCap = 'round'; g.lineJoin = 'round'
  // v: page (x, y) → canvas (y2 - y, x - x1): a quarter turn clockwise so bottom→top reads left→right
  const map = ([x, y]: Pt): Pt => (l.dir === 'v' ? [pad + (y2 - y) * s, pad + (x - x1) * s] : [pad + (x - x1) * s, pad + (y - y1) * s])
  for (const st of l.strokes) { g.beginPath(); st.forEach((p, i) => { const [X, Y] = map(p); if (i) g.lineTo(X, Y); else g.moveTo(X, Y) }); g.stroke() }
  return c.toBuffer('image/png')
}
