import { readFileSync, writeFileSync } from 'node:fs'
import { readPdf } from '../src/pdf'
import { wallColour, drawings } from '../src/plan'
import { Grid, png } from '../src/raster'
const p = await readPdf(new Uint8Array(readFileSync(process.argv[2])))
const ds = drawings(p, wallColour(p.shapes)!)
const polys = ds.flatMap(d => d.walls)
const g = Grid.around(polys, 1, 10); polys.forEach((q, i) => g.fill(q, i + 1))
writeFileSync(process.argv[3], png(g, k => g.a[k] ? [0, 100 + (g.a[k] * 53) % 155, 255] : [255, 255, 255]))
console.log(polys.map(q => q.length).join(' '))
