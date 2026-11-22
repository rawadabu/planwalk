// PDF + readings → plan@1 (+ a debug picture per storey). Usage: tsx scripts/plan.ts plan.pdf readings.json outdir
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import { readLayers } from '../src/pdf'
import { understand } from '../src/sheet'
import { toHouse } from '../src/tohouse'
const [, , file, readings, out] = process.argv
mkdirSync(out, { recursive: true })
const L = await readLayers(new Uint8Array(readFileSync(file)))
const read = new Map<number, any>(JSON.parse(readFileSync(readings, 'utf8')).map((r: any) => [r.id, r]))
const t = Date.now(), plan = understand(L, read)
console.log('ms', Date.now() - t, JSON.stringify(plan.scale), plan.warnings)
writeFileSync(`${out}/plan.json`, JSON.stringify(plan))
const built = toHouse(plan, { id: process.argv[5] ?? 'auto', file: 'plan.pdf' })
writeFileSync(`${out}/house.json`, JSON.stringify(built.house)); for (const [k, v] of Object.entries(built.maps)) writeFileSync(`${out}/${k}`, v)
const pal = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fed7aa', '#a5f3fc', '#f5d0fe', '#d9f99d', '#e2e8f0', '#fecdd3', '#c7d2fe']
for (const s of plan.storeys) {
  console.log(`\nstorey ${s.storey} "${s.title}" drawing ${s.drawing} ${s.side} match ${s.match}`)
  for (const r of s.rooms) console.log(`  ${r.outdoor ? 'out' : 'in '} ${r.from.padEnd(5)} ${r.name.padEnd(14)} ${r.area.toFixed(1).padStart(5)} m²  ${r.rect.join(',')}`)
  console.log('  openings:', s.openings.map(o => `${o.kind}${o.sure ? '' : '?'} ${Math.round(Math.max(o.rect[2] - o.rect[0], o.rect[3] - o.rect[1]) / 0.99318)}cm`).join(' · '))
  const [x1, y1, x2, y2] = [s.bounds[0] - 120, s.bounds[1] - 120, s.bounds[2] + 120, s.bounds[3] + 120], k = .7
  const c = createCanvas((x2 - x1) * k, (y2 - y1) * k), g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(k, k); g.translate(-x1, -y1)
  s.rooms.forEach((r, i) => { g.fillStyle = pal[i % pal.length]; g.globalAlpha = r.outdoor ? .35 : .8; for (const t of r.tiles) g.fillRect(t[0], t[1], t[2] - t[0], t[3] - t[1]); g.globalAlpha = 1 })
  g.fillStyle = '#0f172a'; for (const p of s.walls) { g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill() }
  for (const o of s.openings) { g.fillStyle = o.kind === 'door' ? '#dc2626' : o.kind === 'glass-door' ? '#0891b2' : '#22d3ee'; g.fillRect(o.rect[0], o.rect[1], o.rect[2] - o.rect[0], o.rect[3] - o.rect[1]) }
  g.textAlign = 'center'; g.fillStyle = '#0f172a'
  for (const r of s.rooms) { const cx = r.at?.[0] ?? (r.rect[0] + r.rect[2]) / 2, cy = r.at?.[1] ?? (r.rect[1] + r.rect[3]) / 2; g.font = 'bold 26px DejaVu Sans'; g.fillText(r.name + (r.from === 'guess' ? ' ?' : ''), cx, cy); g.font = '20px DejaVu Sans'; g.fillText(`${r.area.toFixed(1)} m²`, cx, cy + 26) }
  writeFileSync(`${out}/plan_f${s.storey}.png`, c.toBuffer('image/png'))
}
