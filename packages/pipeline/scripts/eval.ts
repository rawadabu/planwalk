// Compare an auto-built house with the hand-built twin-a: wall overlap (IoU) after the best shift, room and glass matches.
import { readFileSync } from 'node:fs'
import { Grid } from '../src/raster'
const [, , autoPath] = process.argv
const A = JSON.parse(readFileSync(autoPath, 'utf8')), T = JSON.parse(readFileSync('../../storage/houses/twin-a/house.json', 'utf8'))
for (const f of [0, 1, 2]) {
  const fa = A.floors[f], ft = T.floors[f]
  const [bx1, by1, bx2, by2] = fa.bounds
  // truth walls cropped to the auto unit's bounds (twin-a keeps bits of the neighbour)
  const g1 = Grid.around([[[bx1 - 200, by1 - 200], [bx2 + 200, by2 + 200], [bx1 - 200, by2 + 200]]], 4, 0)
  for (const p of ft.walls) g1.fill(p)
  let best = { iou: 0, dx: 0, dy: 0 }
  for (let dx = -40; dx <= 40; dx += 4) for (let dy = -40; dy <= 40; dy += 4) {
    const g2 = g1.like(); for (const p of fa.walls) g2.fill(p.map(([x, y]: number[]) => [x + dx, y + dy]))
    let i = 0, u = 0
    for (let k = 0; k < g1.a.length; k++) { const [x, y] = g1.px(k % g1.w, Math.floor(k / g1.w)); if (x < bx1 || x > bx2 || y < by1 || y > by2) continue; const a = g1.a[k], b = g2.a[k]; if (a && b) i++; if (a || b) u++ }
    if (i / u > best.iou) best = { iou: i / u, dx, dy }
  }
  // rooms: each truth indoor room → best IoU auto room
  const rIoU = (a: number[], b: number[]) => { const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])); const i = w * h; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i) }
  const rooms = ft.rooms.slice(0, ft.indoor).map((r: any[]) => { const tr = r.slice(2).map((v: number, i: number) => v); let m = 0, nm = ''; for (const q of fa.rooms.slice(0, fa.indoor)) { const sh = [q[2] + best.dx, q[3] + best.dy, q[4] + best.dx, q[5] + best.dy]; const v = rIoU(tr, sh); if (v > m) { m = v; nm = q[0] } } return `${r[0]} ${(m * 100).toFixed(0)}%` })
  console.log(`f${f} walls IoU ${(best.iou * 100).toFixed(1)}% shift ${best.dx},${best.dy}px | rooms auto ${fa.indoor} vs ${ft.indoor}: ${rooms.join(', ')} | glass auto ${fa.glass.length} vs ${ft.glass.length}`)
}
