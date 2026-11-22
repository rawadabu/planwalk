// The sheet as the pipeline understands it so far: layers by role, labels, doors and glazing. Usage: tsx scripts/overlay.ts plan.pdf out.png [x y w h] [scale]
import { readFileSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import { readLayers } from '../src/pdf'
import { layerRoles, textLabels, dimLabels } from '../src/labels'
import { openings } from '../src/openings'
const [, , file, out, vb, sc] = process.argv
const L = await readLayers(new Uint8Array(readFileSync(file)))
const roles = layerRoles(L), T = textLabels(L, roles), D = dimLabels(L, roles), O = openings(L, roles)
const [vx, vy, vw, vh] = vb ? vb.split(' ').map(Number) : [0, 0, L.width, L.height], s = Number(sc ?? 2)
const c = createCanvas(Math.ceil(vw * s), Math.ceil(vh * s)), g = c.getContext('2d')
g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.translate(-vx * s, -vy * s); g.scale(s, s)
const colour: Record<string, string> = { wall: '#1f6feb', text: '#0a7d32', dim: '#c2410c', door: '#b91c1c', furniture: '#9ca3af', planting: '#bbf7d0', other: '#c9ced6' }
for (const role of ['planting', 'other', 'furniture', 'wall', 'dim', 'text', 'door']) for (const p of L.paths) {
  if (roles[p.layer] !== role) continue
  g.beginPath(); for (const sub of p.subs) { sub.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (sub.closed) g.closePath() }
  if (role === 'wall') { g.fillStyle = '#1f6feb'; g.fill('evenodd') } else { g.strokeStyle = colour[role]; g.lineWidth = role === 'door' ? .5 : .3; g.stroke() }
}
g.lineWidth = .5
for (const l of T) { g.strokeStyle = '#0a7d32'; g.fillStyle = 'rgba(10,125,50,.10)'; const [a, b, e, f] = l.box; g.fillRect(a - 1, b - 1, e - a + 2, f - b + 2); g.strokeRect(a - 1, b - 1, e - a + 2, f - b + 2) }
for (const l of D.labels) { g.strokeStyle = '#c2410c'; const [a, b, e, f] = l.box; g.strokeRect(a - .6, b - .6, e - a + 1.2, f - b + 1.2) }
for (const o of O.openings) {
  const [a, b, e, f] = o.box
  if (o.kind === 'door') { g.fillStyle = 'rgba(220,38,38,.28)'; g.fillRect(a, b, e - a, f - b); g.strokeStyle = '#dc2626'; g.lineWidth = 1; g.strokeRect(a, b, e - a, f - b); if (o.hinge) { g.fillStyle = '#dc2626'; g.beginPath(); g.arc(o.hinge[0], o.hinge[1], 1.6, 0, 7); g.fill() } }
  else { g.fillStyle = 'rgba(6,182,212,.45)'; g.fillRect(a - .8, b - .8, e - a + 1.6, f - b + 1.6); g.strokeStyle = '#0891b2'; g.lineWidth = .8; g.strokeRect(a - .8, b - .8, e - a + 1.6, f - b + 1.6) }
}
writeFileSync(out, c.toBuffer('image/png'))
console.log(JSON.stringify({ text: T.length, dims: D.labels.length, doors: O.openings.filter(o => o.kind === 'door').length, glazing: O.openings.filter(o => o.kind === 'glazing').length, tags: O.tags.length }))
