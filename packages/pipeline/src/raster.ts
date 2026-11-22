import { deflateSync } from 'node:zlib'
import type { Pt } from './pdf'

/** A boolean / label grid over house px. `cell` px per cell, origin at (ox, oy). */
export class Grid {
  readonly a: Int32Array
  constructor(readonly w: number, readonly h: number, readonly cell: number, readonly ox: number, readonly oy: number) { this.a = new Int32Array(w * h) }
  static around(polys: Pt[][], cell: number, margin: number) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const p of polys) for (const [x, y] of p) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y) }
    const ox = x1 - margin, oy = y1 - margin
    return new Grid(Math.ceil((x2 - x1 + 2 * margin) / cell), Math.ceil((y2 - y1 + 2 * margin) / cell), cell, ox, oy)
  }
  like() { return new Grid(this.w, this.h, this.cell, this.ox, this.oy) }
  get(i: number, j: number) { return i < 0 || j < 0 || i >= this.w || j >= this.h ? 0 : this.a[j * this.w + i] }
  /** cell centre → px */
  px(i: number, j: number): Pt { return [this.ox + (i + .5) * this.cell, this.oy + (j + .5) * this.cell] }
  /** Even–odd scanline fill of a polygon at cell centres. */
  fill(p: Pt[], v = 1) {
    const ys = p.map(q => q[1]), j1 = Math.max(0, Math.floor((Math.min(...ys) - this.oy) / this.cell)), j2 = Math.min(this.h - 1, Math.ceil((Math.max(...ys) - this.oy) / this.cell))
    for (let j = j1; j <= j2; j++) {
      const y = this.oy + (j + .5) * this.cell, xs: number[] = []
      for (let k = 0, l = p.length - 1; k < p.length; l = k++) {
        const [ax, ay] = p[l], [bx, by] = p[k]
        if ((ay > y) !== (by > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i1 = Math.max(0, Math.ceil((xs[k] - this.ox) / this.cell - .5)), i2 = Math.min(this.w - 1, Math.floor((xs[k + 1] - this.ox) / this.cell - .5))
        for (let i = i1; i <= i2; i++) this.a[j * this.w + i] = v
      }
    }
  }
}

/** Exact squared Euclidean distance (in cells) to the nearest cell where `src` is non-zero (Felzenszwalb–Huttenlocher). */
export function edt(src: Grid): Float64Array {
  const { w, h } = src, INF = 1e20, d = new Float64Array(w * h)
  for (let k = 0; k < w * h; k++) d[k] = src.a[k] ? 0 : INF
  const n = Math.max(w, h), f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), out = new Float64Array(n)
  const pass = (len: number, get: (k: number) => number, set: (k: number, x: number) => void) => {
    for (let q = 0; q < len; q++) f[q] = get(q)
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]] }
    for (let q = 0; q < len; q++) set(q, out[q])
  }
  for (let i = 0; i < w; i++) pass(h, j => d[j * w + i], (j, x) => { d[j * w + i] = x })
  for (let j = 0; j < h; j++) pass(w, i => d[j * w + i], (i, x) => { d[j * w + i] = x })
  return d
}

/** Morphological closing with a disc of radius r cells. */
export function close(g: Grid, r: number): Grid {
  const r2 = r * r
  const dil = g.like(), d1 = edt(g)
  for (let k = 0; k < d1.length; k++) dil.a[k] = d1[k] <= r2 ? 1 : 0
  const inv = g.like(); for (let k = 0; k < inv.a.length; k++) inv.a[k] = dil.a[k] ? 0 : 1
  const d2 = edt(inv), out = g.like()
  for (let k = 0; k < d2.length; k++) out.a[k] = d2[k] > r2 ? 1 : 0
  return out
}

/** 4-connected components of cells where `pred` holds; returns labels (1..n, 0 = none) and sizes. */
export function components(g: Grid, pred: (k: number) => boolean) {
  const { w, h } = g, lab = g.like(), sizes = [0], stack: number[] = []
  for (let s = 0; s < w * h; s++) {
    if (lab.a[s] || !pred(s)) continue
    const id = sizes.length; let n = 0
    lab.a[s] = id; stack.push(s)
    while (stack.length) {
      const k = stack.pop()!, i = k % w, j = (k - i) / w; n++
      const nb = [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1]
      for (const m of nb) if (m >= 0 && !lab.a[m] && pred(m)) { lab.a[m] = id; stack.push(m) }
    }
    sizes.push(n)
  }
  return { lab, sizes }
}

/** Cells not reachable from the border through cells where `wall` is 0 → filled (holes of the wall mask). */
export function fillHoles(g: Grid): Grid {
  const { w, h } = g, out = g.like(), seen = new Uint8Array(w * h), q: number[] = []
  const push = (k: number) => { if (!seen[k] && !g.a[k]) { seen[k] = 1; q.push(k) } }
  for (let i = 0; i < w; i++) { push(i); push((h - 1) * w + i) }
  for (let j = 0; j < h; j++) { push(j * w); push(j * w + w - 1) }
  while (q.length) { const k = q.pop()!, i = k % w; if (i > 0) push(k - 1); if (i < w - 1) push(k + 1); if (k >= w) push(k - w); if (k < w * (h - 1)) push(k + w) }
  for (let k = 0; k < w * h; k++) out.a[k] = seen[k] ? 0 : 1
  return out
}

/** Debug PNG: each cell's colour from `colour(k)` as [r,g,b]. */
export function png(g: Grid, colour: (k: number) => [number, number, number]): Buffer {
  const { w, h } = g, raw = Buffer.alloc((w * 3 + 1) * h)
  for (let j = 0; j < h; j++) { raw[j * (w * 3 + 1)] = 0; for (let i = 0; i < w; i++) { const c = colour(j * w + i), o = j * (w * 3 + 1) + 1 + i * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2] } }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
