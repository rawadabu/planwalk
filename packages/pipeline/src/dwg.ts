import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * Read an AutoCAD drawing (.dwg) as plain geometry: every line, polyline, arc and text of model space in drawing
 * units (y up), blocks expanded in place, each with the CAD layer it was drawn on. Nothing is interpreted here.
 */
export type P2 = [number, number]
export interface CadLine {
  layer: string
  pts: P2[]
  closed: boolean
  curved: boolean
  /** arcs and circles: centre and radius (after block scaling) */
  centre?: P2; radius?: number
  /** line type name when it is not continuous (HIDDEN, DASHED, CENTER …) */
  dashed: boolean
  /** the block this was drawn inside, if any */
  block: string | null
  /** index (in `inserts`) of the top-level block placement this belongs to: one piece of furniture, one window … */
  inst?: number
}
/** `span`: how far the text runs from `at` along its direction; negative when it is written backwards (Hebrew fonts run right to left) */
export interface CadText { layer: string; text: string; at: P2; height: number; span: number; rotation: number; block: string | null }
export interface CadInsert { layer: string; name: string; at: P2; rotation: number; sx: number; sy: number; /** 0 = placed in the drawing itself, 1+ = inside another block */ depth: number }
export interface Cad { lines: CadLine[]; texts: CadText[]; inserts: CadInsert[]; layers: string[]; /** $INSUNITS: 4 mm, 5 cm, 6 m, 0 not stated */ units: number }

const KEY: Record<string, string> = { t: 'א', c: 'ב', d: 'ג', s: 'ד', v: 'ה', u: 'ו', z: 'ז', j: 'ח', y: 'ט', h: 'י', f: 'כ', k: 'ל', n: 'מ', b: 'נ', x: 'ס', g: 'ע', p: 'פ', m: 'צ', e: 'ק', r: 'ר', a: 'ש', ',': 'ת', l: 'ך', o: 'ם', i: 'ן', ';': 'ף', '.': 'ץ', w: "'", q: '/', '/': '.' }
const DOS = 'אבגדהוזחטיךכלםמןנסעףפץצקרשת'                      // code page 862, 0x80…0x9A
const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a }

/**
 * Hebrew as old AutoCAD stores it. Three conventions turn up, sometimes in one drawing:
 *   keyboard fonts (HEBTXT, MIRYL …): Latin keys stand for the Hebrew letters on them, letters typed in reading
 *     order, numbers and Latin words typed back to front;
 *   DOS fonts: code page 862 bytes shown as Windows-1252 characters, the whole line back to front;
 *   Unicode typed back to front (visual order).
 */
export function hebrew(raw: unknown): string {
  let s = String(raw ?? '').replace(/%%([pPcCdD])/g, (_, c) => ({ p: '±', c: '⌀', d: '°' })[String(c).toLowerCase() as 'p' | 'c' | 'd']).replace(/\\[A-Za-z][^;\\]*;|[{}]/g, '').replace(/\\P/g, ' ').trim()
  if (/[֐-׿]/.test(s)) return [...s].reverse().join('')
  if ([...s].some(ch => CP1252[ch] !== undefined)) return [...s].reverse().map(ch => { const b = CP1252[ch] ?? ch.charCodeAt(0); return b >= 0x80 && b <= 0x9a ? DOS[b - 0x80] : ch }).join('')
  if (!/[a-z]/.test(s)) return s
  return s.replace(/[^a-z,.;wq'" ]+(?: [^a-z,.;wq'" ]+)*/g, run => [...run].reverse().join('')).replace(/[a-z,.;wq/]/g, ch => KEY[ch] ?? ch)
}

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
const at = (m: M, p: { x: number; y: number }): P2 => [m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]]
const DASH = /HIDDEN|DASH|PHANTOM|CENTER|DOT|DIVIDE|BORDER/i

let lib: Promise<any> | null = null
async function libredwg() {
  lib ??= (async () => {
    const { LibreDwg } = await import('@mlightcad/libredwg-web')
    const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@mlightcad/libredwg-web')), '..', 'wasm') + path.sep
    return (LibreDwg as any).create(dir)
  })()
  return lib
}

export async function readDwg(data: Uint8Array): Promise<Cad> {
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web')
  const dw = await libredwg()
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  // the reader reports recoverable damage on the console; a drawing that yields no geometry is the real failure
  const log = console.log; console.log = () => {}
  let db: any
  try { const h = dw.dwg_read_data(buf, (Dwg_File_Type as any).DWG); if (!h) throw new Error('not a readable DWG file'); db = dw.convert(h); try { dw.dwg_free(h) } catch { /* already released */ } } finally { console.log = log }
  return flatten(db)
}

/** The converted database → primitives. Exported for tests that keep a converted drawing as JSON. */
export function flatten(db: any): Cad {
  const blocks = new Map<string, any>()
  for (const b of db?.tables?.BLOCK_RECORD?.entries ?? []) blocks.set(b.name, b)
  const out: Cad = { lines: [], texts: [], inserts: [], layers: [], units: Number(db?.header?.INSUNITS ?? 0) || 0 }
  const seen = new Set<string>()
  const walk = (ents: any[] | undefined, m: M, depth: number, inLayer: string | null, block: string | null, inst?: number) => {
    for (const e of ents ?? []) {
      if (!e || e.isVisible === false || e.isInPaperSpace) continue
      const layer: string = e.layer === '0' && inLayer ? inLayer : String(e.layer ?? '0')
      const k = Math.hypot(m[0], m[1]), dashed = DASH.test(String(e.lineType ?? ''))
      const push = (pts: P2[], closed: boolean, curved: boolean, extra: Partial<CadLine> = {}) => { const q = pts.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])); if (q.length >= 2) { out.lines.push({ layer, pts: q, closed, curved, dashed, block, ...(inst === undefined ? {} : { inst }), ...extra }); seen.add(layer) } }
      if (e.type === 'LINE') push([at(m, e.startPoint), at(m, e.endPoint)], false, false)
      else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE2D' || e.type === 'POLYLINE3D') {
        const vs: any[] = e.vertices ?? [], closed = !!(e.flag & 1), pts: P2[] = []
        let curved = false
        for (let i = 0; i < vs.length; i++) {
          const p = vs[i].point ?? vs[i], a = at(m, p); pts.push(a)
          const q0 = vs[i + 1] ? (vs[i + 1].point ?? vs[i + 1]) : closed ? (vs[0].point ?? vs[0]) : null, bulge = Number(vs[i].bulge) || 0
          if (!bulge || !q0) continue
          // a bulged segment is an arc: 7 chords
          const b = at(m, q0), th = 4 * Math.atan(bulge), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1e-9) continue
          const r = d / (2 * Math.sin(th / 2)), hgt = r * Math.cos(th / 2), cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) / d * hgt, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) / d * hgt, a0 = Math.atan2(a[1] - cy, a[0] - cx)
          for (let t = 1; t < 8; t++) pts.push([cx + Math.abs(r) * Math.cos(a0 + th * t / 8), cy + Math.abs(r) * Math.sin(a0 + th * t / 8)])
          curved = true
        }
        push(pts, closed, curved)
      } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
        const a0 = e.type === 'ARC' ? e.startAngle : 0, a1 = e.type === 'ARC' ? (e.endAngle < e.startAngle ? e.endAngle + 2 * Math.PI : e.endAngle) : 2 * Math.PI, pts: P2[] = []
        for (let i = 0; i <= 16; i++) { const a = a0 + (a1 - a0) * i / 16; pts.push(at(m, { x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) })) }
        push(pts, e.type === 'CIRCLE', true, { centre: at(m, e.center), radius: e.radius * k })
      } else if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTRIB') {
        const t = e.text && typeof e.text === 'object' ? e.text : e, p = t.startPoint ?? t.insertionPoint ?? e.insertionPoint
        const text = hebrew(t.text)
        if (p && text) {
          const height = (Number(t.textHeight ?? t.height) || 0) * k, width = Math.max(height, .62 * height * text.length * (Number(t.xScale) || 1))
          out.texts.push({ layer, text, at: at(m, p), height, span: Number(t.generationFlag) & 2 ? -width : width, rotation: Number(t.rotation) || 0, block })
        }
      } else if (e.type === 'INSERT' && depth < 6) {
        const b = blocks.get(e.name); if (!b || !e.insertionPoint) continue
        const r = Number(e.rotation) || 0, sx = Number(e.xScale ?? 1) || 1, sy = Number(e.yScale ?? 1) || 1, c = Math.cos(r), s = Math.sin(r), bp = b.basePoint ?? { x: 0, y: 0 }
        out.inserts.push({ layer, name: String(e.name), at: at(m, e.insertionPoint), rotation: r, sx, sy, depth })
        const top = inst ?? out.inserts.length - 1
        walk(b.entities, mul(mul(m, [c * sx, s * sx, -s * sy, c * sy, e.insertionPoint.x, e.insertionPoint.y]), [1, 0, 0, 1, -bp.x, -bp.y]), depth + 1, layer, String(e.name), top)
      }
    }
  }
  walk(db?.entities, [1, 0, 0, 1, 0, 0], 0, null, null)
  out.layers = [...seen]
  return out
}
