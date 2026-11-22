// Contact sheet of label crops (debug). Usage: tsx scripts/labels.ts plan.pdf outdir
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readLayers } from '../src/pdf'
import { layerRoles, textLabels, dimLabels, renderLabel, type Label } from '../src/labels'
const [, , file, out] = process.argv
mkdirSync(out, { recursive: true })
const L = await readLayers(new Uint8Array(readFileSync(file)))
const roles = layerRoles(L); console.log(roles)
const T = textLabels(L, roles), D = dimLabels(L, roles)
console.log('text labels', T.length, 'dim lines', D.lines.length, 'dim labels', D.labels.length, 'v:', D.labels.filter(l => l.dir === 'v').length)
async function sheet(ls: Label[], name: string, px: number) {
  const imgs = await Promise.all(ls.map(l => loadImage(renderLabel(l, px))))
  const cw = 190, ch = px + 26, cols = 8, c = createCanvas(cols * cw, Math.ceil(ls.length / cols) * ch), g = c.getContext('2d')
  g.fillStyle = '#eee'; g.fillRect(0, 0, c.width, c.height)
  imgs.forEach((im, i) => { const sc = Math.min(1, (cw - 6) / im.width); g.drawImage(im, (i % cols) * cw + 3, Math.floor(i / cols) * ch + 3, im.width * sc, im.height * sc) })
  writeFileSync(`${out}/${name}.png`, c.toBuffer('image/png'))
}
await sheet(T.slice(0, 96), 'text', 40); await sheet(D.labels.slice(0, 160), 'dims', 36)
