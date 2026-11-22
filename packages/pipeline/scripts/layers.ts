// Per-layer summary and one debug SVG per layer. Usage: tsx scripts/layers.ts plan.pdf outdir
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { readLayers } from '../src/pdf'
const [, , file, out] = process.argv
mkdirSync(out, { recursive: true })
const L = await readLayers(new Uint8Array(readFileSync(file)))
const d = (p: any) => p.subs.map((s: any) => 'M' + s.points.map(([x, y]: number[]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + (s.closed ? 'Z' : '')).join('')
for (const name of L.layers) {
  const ps = L.paths.filter(p => p.layer === name)
  const styles: Record<string, number> = {}; let curved = 0, dashed = 0, pts = 0
  for (const p of ps) { const k = `${p.paint} ${p.paint === 'fill' ? p.fill : p.stroke} w${p.width.toFixed(2)}`; styles[k] = (styles[k] ?? 0) + 1; if (p.subs.some(s => s.curved)) curved++; if (p.dashed) dashed++; pts += p.subs.reduce((a, s) => a + s.points.length, 0) }
  console.log(JSON.stringify(name), ps.length, 'paths', pts, 'pts', 'curved', curved, 'dashed', dashed, JSON.stringify(styles))
}
const colours = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#800000', '#808000', '#000075', '#f032e6', '#469990', '#000', '#555', '#aa6e28', '#fa8072', '#6a5acd', '#2e8b57', '#b8860b']
const body = L.layers.map((name, i) => `<g id="${name}" fill="none" stroke="${colours[i % colours.length]}" stroke-width="0.35">${L.paths.filter(p => p.layer === name).map(p => `<path d="${d(p)}"${p.paint !== 'stroke' ? ` fill="${colours[i % colours.length]}" fill-opacity=".35"` : ''}/>`).join('')}</g>`).join('')
writeFileSync(out + '/layers.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`)
writeFileSync(out + '/legend.json', JSON.stringify(Object.fromEntries(L.layers.map((n, i) => [n, colours[i % colours.length]]))))
