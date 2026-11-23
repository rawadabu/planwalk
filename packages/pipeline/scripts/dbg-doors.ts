// debug: what is drawn on the door layer (and others) in a box of the page (page.png px at 5160 wide)
import { readFileSync } from 'node:fs'
import { readLayers, layerRoles } from '../src'
import { openings } from '../src/openings'
const [, , pdf, x1s, y1s, x2s, y2s] = process.argv
const L = await readLayers(new Uint8Array(readFileSync(pdf)))
const k = L.width / 5160, box = [x1s, y1s, x2s, y2s].map(v => Number(v) * k)
const roles = layerRoles(L)
console.log('page', L.width.toFixed(0), L.height.toFixed(0), 'box pt', box.map(v => v.toFixed(0)).join(','))
const inBox = (p: number[]) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]
for (const p of L.paths) for (const s of p.subs) {
  if (!s.points.some(inBox) || roles[p.layer] === 'dim' || roles[p.layer] === 'text') continue
  const xs = s.points.map(q => q[0]), ys = s.points.map(q => q[1])
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  if (Math.max(w, h) < 6) continue
  console.log(p.layer.padEnd(8), roles[p.layer].padEnd(9), p.paint, 'w', p.width.toFixed(2), p.dashed ? 'dash' : '', s.curved ? 'CURVE' : '', s.closed ? 'closed' : '', 'n', s.points.length, 'bbox', [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => (v / k).toFixed(0)).join(','), 'size pt', w.toFixed(1), h.toFixed(1))
}
const o = openings(L, roles)
for (const op of o.openings) if (inBox([(op.box[0] + op.box[2]) / 2, (op.box[1] + op.box[3]) / 2])) console.log('OPENING', op.kind, op.axis, op.box.map(v => (v / k).toFixed(0)).join(','))
