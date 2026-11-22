import type { DimLine, Label } from './labels'
import type { Pt } from './pdf'

/**
 * The sheet's real scale, from what the architect wrote: every dimension is a number (cm) written along a line between
 * two tick marks. points-per-cm is the median over all of them — one misread number cannot move it, and each dimension
 * that disagrees with the median is reported (a misread, or a dimension written beside a different span).
 */
export interface Measured { id: number; cm: number; pt: number; ratio: number; ok: boolean }
export interface Scale { ptPerCm: number; used: number; agree: number; spread: number; measured: Measured[] }

export function calibrate(lines: DimLine[], ticks: Pt[], labels: Label[], cmOf: (l: Label) => number | null): Scale | null {
  const measured: Measured[] = []
  for (const l of labels) {
    const cm = cmOf(l)
    if (cm === null || cm < 50) continue                              // small ones are written off to the side
    const cx = (l.box[0] + l.box[2]) / 2, cy = (l.box[1] + l.box[3]) / 2
    // its dimension line: parallel, nearest, and running past the label
    let best: { d: number; line: DimLine } | null = null
    for (const line of lines) {
      const horiz = Math.abs(line.a[1] - line.b[1]) < .5
      if (horiz !== (l.dir === 'h')) continue
      const lo = horiz ? Math.min(line.a[0], line.b[0]) : Math.min(line.a[1], line.b[1]), hi = horiz ? Math.max(line.a[0], line.b[0]) : Math.max(line.a[1], line.b[1])
      const along = horiz ? cx : cy, d = Math.abs(horiz ? cy - line.a[1] : cx - line.a[0])
      if (along < lo || along > hi || d > 12) continue
      if (!best || d < best.d) best = { d, line }
    }
    if (!best) continue
    const horiz = l.dir === 'h', at = horiz ? best.line.a[1] : best.line.a[0], along = horiz ? cx : cy
    // ticks on that line, either side of the label
    const on = ticks.filter(t => Math.abs((horiz ? t[1] : t[0]) - at) < .8).map(t => (horiz ? t[0] : t[1])).sort((a, b) => a - b)
    const pos: number[] = []; for (const v of on) if (!pos.length || v - pos[pos.length - 1] > 1.5) pos.push(v)   // a tick is a few strokes
    let lo = -Infinity, hi = Infinity
    for (const v of pos) { if (v <= along && v > lo) lo = v; if (v >= along && v < hi) hi = v }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 3) continue
    measured.push({ id: l.id, cm, pt: hi - lo, ratio: (hi - lo) / cm, ok: false })
  }
  if (measured.length < 3) return null
  const rs = measured.map(m => m.ratio).sort((a, b) => a - b), med = rs[Math.floor(rs.length / 2)]
  for (const m of measured) m.ok = Math.abs(m.ratio / med - 1) < .03
  const good = measured.filter(m => m.ok)
  const ptPerCm = good.reduce((a, m) => a + m.pt, 0) / good.reduce((a, m) => a + m.cm, 0)     // long spans weigh more
  const dev = good.map(m => Math.abs(m.ratio / ptPerCm - 1)).sort((a, b) => a - b)
  return { ptPerCm, used: measured.length, agree: good.length, spread: dev[Math.floor(dev.length * .9)] ?? 0, measured }
}
