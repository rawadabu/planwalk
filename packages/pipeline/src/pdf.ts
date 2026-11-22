/**
 * Read a CAD-exported floor-plan PDF as vector shapes: every filled path with its fill colour, in page points
 * (y down, origin top-left). No rasterising, no OCR: the drawing's own geometry.
 */
export type Pt = [number, number]
export interface Shape { fill: string; points: Pt[] }
export interface PdfPage { width: number; height: number; shapes: Shape[] }

// pdf.js paint operators that fill (constructPath's first argument) and path-data codes
const FILL_OPS = new Set([22, 23, 24, 25, 26, 27])                    // fill, eoFill, fillStroke, eoFillStroke, closeFillStroke, closeEOFillStroke
const MOVE = 0, LINE = 1, CURVE = 2, CLOSE = 3, QUAD = 4         // pdf.js 5 DrawOPS

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
const apply = (m: M, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export async function readPdf(data: Uint8Array, pageNo = 1): Promise<PdfPage> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { OPS } = pdfjs
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
  const page = await doc.getPage(pageNo)
  const [x0, y0, x1, y1] = page.view
  const W = x1 - x0, H = y1 - y0
  const ol = await page.getOperatorList()
  let ctm: M = [1, 0, 0, 1, 0, 0], fill = '#000000'
  const stack: Array<{ ctm: M; fill: string }> = []
  const shapes: Shape[] = []
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i] as any
    if (fn === OPS.save) stack.push({ ctm, fill })
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; fill = s.fill } }
    else if (fn === OPS.transform) ctm = mul(ctm, args as M)
    else if (fn === OPS.setFillRGBColor) fill = String(args[0]).toLowerCase()
    else if (fn === OPS.constructPath) {
      const op = args[0], data = args[1]?.[0] as Float32Array | undefined
      if (!FILL_OPS.has(op) || !data) continue
      let cur: Pt[] = []
      const flush = () => { cur = cur.filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1])); if (cur.length >= 3) shapes.push({ fill, points: cur }); cur = [] }
      for (let k = 0; k < data.length;) {
        const code = data[k++]
        if (k > data.length - 1) break
        if (code === MOVE) { flush(); cur.push(apply(ctm, data[k], data[k + 1])); k += 2 }
        else if (code === LINE) { cur.push(apply(ctm, data[k], data[k + 1])); k += 2 }
        else if (code === CURVE) { cur.push(apply(ctm, data[k + 4], data[k + 5])); k += 6 }      // end point is enough for walls
        else if (code === QUAD) { cur.push(apply(ctm, data[k + 2], data[k + 3])); k += 4 }
        else if (code === CLOSE) flush()
        else break
      }
      flush()
    }
  }
  // page space → y down from the top-left corner
  for (const s of shapes) s.points = s.points.map(([x, y]) => [x - x0, H - (y - y0)])
  return { width: W, height: H, shapes }
}

/** Every drawn path with the CAD layer it came from (PDF optional-content group), its style and geometry. */
export interface Path {
  layer: string
  paint: 'stroke' | 'fill' | 'both'
  stroke: string
  fill: string
  width: number                    // line width in page points
  dashed: boolean
  subs: Array<{ points: Pt[]; closed: boolean; curved: boolean }>
}
export interface PdfLayers { width: number; height: number; layers: string[]; paths: Path[] }

const STROKE_OPS = new Set([20, 21, 24, 25, 26, 27])                  // stroke, closeStroke and the fill+stroke family

export async function readLayers(data: Uint8Array, pageNo = 1): Promise<PdfLayers> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { OPS } = pdfjs
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
  const page = await doc.getPage(pageNo)
  const [x0, y0, x1, y1] = page.view
  const W = x1 - x0, H = y1 - y0
  const oc: any = await doc.getOptionalContentConfig()
  const ol = await page.getOperatorList()
  const nameOf = (id: string) => { try { return String(oc.getGroup(id)?.name ?? id) } catch { return id } }
  let ctm: M = [1, 0, 0, 1, 0, 0], fill = '#000000', stroke = '#000000', width = 1, dashed = false
  const stack: Array<{ ctm: M; fill: string; stroke: string; width: number; dashed: boolean }> = []
  const marks: string[] = [], paths: Path[] = [], seen = new Set<string>()
  const scale = () => Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]))
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i] as any
    if (fn === OPS.save) stack.push({ ctm, fill, stroke, width, dashed })
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) ({ ctm, fill, stroke, width, dashed } = s) }
    else if (fn === OPS.transform) ctm = mul(ctm, args as M)
    else if (fn === OPS.setFillRGBColor) fill = String(args[0]).toLowerCase()
    else if (fn === OPS.setStrokeRGBColor) stroke = String(args[0]).toLowerCase()
    else if (fn === OPS.setLineWidth) width = Number(args[0])
    else if (fn === OPS.setDash) dashed = Array.isArray(args[0]) && args[0].length > 0
    else if (fn === OPS.beginMarkedContentProps) marks.push(args[0] === 'OC' && args[1]?.id ? nameOf(args[1].id) : '')
    else if (fn === OPS.beginMarkedContent) marks.push('')
    else if (fn === OPS.endMarkedContent) marks.pop()
    else if (fn === OPS.constructPath) {
      const op = args[0], d = args[1]?.[0] as Float32Array | undefined
      const f = FILL_OPS.has(op), st = STROKE_OPS.has(op)
      if (!d || (!f && !st)) continue
      const subs: Path['subs'] = []
      let cur: Pt[] = [], curved = false
      const flush = (closed: boolean) => { cur = cur.filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1])); if (cur.length >= 2) subs.push({ points: cur.map(([x, y]) => [x - x0, H - (y - y0)] as Pt), closed, curved }); cur = []; curved = false }
      for (let k = 0; k < d.length;) {
        const code = d[k++]
        if (code === MOVE) { flush(false); cur.push(apply(ctm, d[k], d[k + 1])); k += 2 }
        else if (code === LINE) { cur.push(apply(ctm, d[k], d[k + 1])); k += 2 }
        else if (code === CURVE) {                                    // flatten the cubic: 6 chords
          const p0 = cur[cur.length - 1] ?? apply(ctm, d[k], d[k + 1]), c1 = apply(ctm, d[k], d[k + 1]), c2 = apply(ctm, d[k + 2], d[k + 3]), p3 = apply(ctm, d[k + 4], d[k + 5])
          for (let t = 1; t <= 6; t++) { const u = t / 6, v = 1 - u; cur.push([v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p3[1]]) }
          curved = true; k += 6
        }
        else if (code === CLOSE) flush(true)
        else break
      }
      flush(false)
      if (!subs.length) continue
      const layer = [...marks].reverse().find(Boolean) ?? ''
      seen.add(layer)
      paths.push({ layer, paint: f && st ? 'both' : f ? 'fill' : 'stroke', stroke, fill, width: width * scale(), dashed, subs })
    }
  }
  return { width: W, height: H, layers: [...seen], paths }
}
