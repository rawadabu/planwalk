import { readFileSync } from 'node:fs'
import { readPdf } from '../src/pdf'
import { wallColour, drawings } from '../src/plan'
const p = await readPdf(new Uint8Array(readFileSync(process.argv[2])))
const ds = drawings(p, wallColour(p.shapes)!)
const h = JSON.parse(readFileSync('../../storage/houses/twin-a/house.json', 'utf8'))
const orient: Array<[string, (x: number, y: number) => [number, number]]> = [
  ['id', (x, y) => [x, y]], ['mx', (x, y) => [-x, y]], ['my', (x, y) => [x, -y]], ['r180', (x, y) => [-x, -y]],
  ['t', (x, y) => [y, x]], ['r90', (x, y) => [-y, x]], ['r270', (x, y) => [y, -x]], ['at', (x, y) => [-y, -x]]]
for (const fk of [0, 1, 2]) {
  const tv: number[][] = h.floors[fk].walls.flat()
  let best: any = { n: 0 }
  for (let di = 0; di < ds.length; di++) for (const [on, o] of orient) for (let s = 2.8; s <= 3.7; s += .01) {
    const pv = ds[di].walls.flat().map(([x, y]) => o(x * s, y * s))
    const votes = new Map<string, number>()
    for (const [a, b] of pv) for (const [c, d] of tv) { const k = `${Math.round((c - a) / 4)},${Math.round((d - b) / 4)}`; votes.set(k, (votes.get(k) ?? 0) + 1) }
    for (const [k, n] of votes) if (n > best.n) best = { n, di, on, s, k }
  }
  console.log('floor', fk, 'twin verts', tv.length, JSON.stringify(best))
}
