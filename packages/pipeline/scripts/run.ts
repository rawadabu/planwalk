import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { readPdf } from '../src/pdf'
import { build, analyse } from '../src/house'
import { png } from '../src/raster'
const [, , file, out] = process.argv
mkdirSync(out, { recursive: true })
const page = await readPdf(new Uint8Array(readFileSync(file)))
const t = Date.now(); const b = build(page, { id: 'auto-twin', file: 'plan.pdf' }); console.log('ms', Date.now() - t)
console.log(JSON.stringify(b.report, null, 1))
writeFileSync(out + '/house.json', JSON.stringify(b.house))
for (const [k, v] of Object.entries(b.maps)) writeFileSync(out + '/' + k, v)
for (const s of [0, 1, 2]) {
  const f = b.house.floors[s as 0]; console.log(s, f.rooms.map(r => r.slice(0, 2).join(' ') + ' ' + r.slice(2).join(',')).join(' | '))
  console.log('  glass', JSON.stringify(f.glass))
  const { grid: { g, inside, lab, gap } } = analyse(f.walls, [0, 1, 2].flatMap(t => b.house.floors[t as 0].walls))
  const pal = (id: number): [number, number, number] => [(id * 97) % 200 + 40, (id * 57) % 200 + 40, (id * 31) % 200 + 40]
  writeFileSync(`${out}/dbg_f${s}.png`, png(g, k => g.a[k] === 2 ? [255, 160, 0] : g.a[k] ? [20, 20, 20] : gap.a[k] ? [255, 0, 0] : lab.a[k] ? pal(lab.a[k]) : inside.a[k] ? [255, 255, 255] : [200, 220, 240]))
}
