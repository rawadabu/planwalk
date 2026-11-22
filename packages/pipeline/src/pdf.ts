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
