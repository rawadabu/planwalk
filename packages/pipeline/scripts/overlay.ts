import { readFileSync, writeFileSync } from 'node:fs'
import { readPdf } from '../src/pdf'
const p = await readPdf(new Uint8Array(readFileSync(process.argv[2])))
const sh = p.shapes.filter(s => s.fill === '#007fff')
const path = sh.map(s => 'M' + s.points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z').join('')
writeFileSync(process.argv[3], `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="820 150 800 620" width="1600" height="1240"><image href="${process.argv[4]}" x="0" y="0" width="${p.width}" height="${p.height}"/><path d="${path}" fill="rgba(255,0,0,.55)" fill-rule="evenodd"/></svg>`)
