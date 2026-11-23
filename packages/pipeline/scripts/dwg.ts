/** DWG → plan@1 → house@1, with a picture of each storey: `tsx scripts/dwg.ts plan.dwg outDir [left|right]` */
import fs from 'node:fs'
import path from 'node:path'
import { readDwg, understandCad, cadRoles, toHouse } from '../src/index'
import { Grid, png } from '../src/raster'

const [file, out = 'out-dwg', unit = 'left'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const t0 = Date.now()
const cad = await readDwg(new Uint8Array(fs.readFileSync(file)))
console.log(`read ${cad.lines.length} lines, ${cad.texts.length} texts in ${Date.now() - t0} ms`)
const roles = cadRoles(cad)
console.log('layers:', Object.entries(roles).filter(([, r]) => r !== 'other' && r !== 'ignore').map(([n, r]) => `${n}=${r}`).join(' '))
const plan = understandCad(cad, { unit: unit as 'left' | 'right' })
console.log(`understood in ${Date.now() - t0} ms`)
for (const s of plan.storeys) {
  console.log(`storey ${s.storey} "${s.title}" side=${s.side} match=${s.match} walls=${s.walls.length} openings=${s.openings.map(o => o.kind[0]).join('')} stairs=${s.stairs.length} railings=${s.railings.length}`)
  for (const r of s.rooms) console.log(`   ${r.outdoor ? 'out' : r.void ? 'void' : 'in '} ${r.from.padEnd(5)} ${String(r.area).padStart(6)} m²  ${r.name}`)
  const g = Grid.around(s.walls, 2, 200)
  const PAL: Array<[number, number, number]> = [[214, 234, 248], [213, 245, 227], [252, 243, 207], [250, 219, 216], [232, 218, 239], [209, 242, 235], [253, 235, 208], [220, 220, 220]]
  const col = new Int32Array(g.w * g.h)
  s.rooms.forEach((r, n) => { for (const t of r.tiles) { const q = g.like(); q.fill([[t[0], t[1]], [t[2], t[1]], [t[2], t[3]], [t[0], t[3]]]); for (let k = 0; k < col.length; k++) if (q.a[k]) col[k] = 10 + (r.outdoor ? 7 : n % 7) } })
  for (const p of s.walls) g.fill(p, 1)
  for (const o of s.openings) g.fill([[o.rect[0], o.rect[1]], [o.rect[2], o.rect[1]], [o.rect[2], o.rect[3]], [o.rect[0], o.rect[3]]], o.kind === 'door' ? 3 : o.kind === 'window' ? 4 : 5)
  for (const st of s.stairs) for (const t of st.treads) { const q = g.like(); q.fill([[t[0] + 2, t[1] + 2], [t[2] - 2, t[1] + 2], [t[2] - 2, t[3] - 2], [t[0] + 2, t[3] - 2]]); for (let k = 0; k < col.length; k++) if (q.a[k] && !g.a[k]) g.a[k] = 6 }
  fs.writeFileSync(path.join(out, `storey${s.storey}.png`), png(g, k => (g.a[k] === 1 ? [30, 40, 50] : g.a[k] === 3 ? [230, 120, 20] : g.a[k] === 4 ? [40, 150, 240] : g.a[k] === 5 ? [20, 200, 200] : g.a[k] === 6 ? [150, 110, 80] : col[k] ? PAL[col[k] - 10] : [255, 255, 255])))
}
console.log('warnings:', plan.warnings)
const { house, maps, warnings } = toHouse(plan, { id: 'dwg', title: path.basename(file), file: path.basename(file) })
fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify(plan))
fs.writeFileSync(path.join(out, 'house.json'), JSON.stringify(house))
for (const [n, svg] of Object.entries(maps)) fs.writeFileSync(path.join(out, n), svg)
console.log(`house: ${house.items.length} items; warnings:`, warnings.filter(w => !plan.warnings.includes(w)))
