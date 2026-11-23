import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse } from '@planwalk/house'
import { readLayers } from '../src/pdf'
import { understand } from '../src/sheet'
import { toHouse } from '../src/tohouse'

// The twin-house plan end to end (its label readings are stored, so no network). Skipped when the PDF is not on this machine.
const PDF = process.env.PLANWALK_TWIN_PDF ?? '/root/.claude/uploads/22b51041-ffec-545b-a19d-b04bd0c1100e/66c0d6ac-01-Model.pdf'
let pdf: Buffer | null = null
try { pdf = readFileSync(PDF) } catch { /* not here */ }

test('the twin house: doors, names, sizes and a stair you can walk', { skip: !pdf }, async () => {
  const L = await readLayers(new Uint8Array(pdf!))
  const read = new Map<number, any>(JSON.parse(readFileSync(new URL('../fixtures/twin/readings.json', import.meta.url), 'utf8')).map((r: any) => [r.id, r]))
  const plan = understand(L, read), { house } = toHouse(plan, { id: 'twin-test' })
  parseHouse(JSON.parse(JSON.stringify(house)))
  const st = (n: number) => plan.storeys.find(s => s.storey === n)!
  // ground floor: the front door and the shelter's door (both drawn as polylines), and no stray windows
  const g = st(0).openings
  assert.equal(g.filter(o => o.kind === 'door').length, 2)
  assert.equal(g.filter(o => o.kind === 'window').length, 2, JSON.stringify(g.map(o => o.kind)))
  assert.ok(st(0).rooms.some(r => r.name === 'מבואת כניסה' && !r.outdoor && r.from === 'label'))
  // sizes as the architect wrote them
  const dims = (f: 0 | 1 | 2) => Object.fromEntries(house.floors[f].rooms.slice(0, house.floors[f].indoor).map(r => [r[0], r[1]]))
  assert.equal(dims(1)['מטבח'], '440 × 460'); assert.equal(dims(1)['מטבחון'], '420 × 360'); assert.equal(dims(0)['ממ"ד'], '310 × 410')
  assert.match(dims(2)['פ"ישיבה'], /מ"ר$/)                                  // an L-shaped room has an area, not a width × depth
  assert.equal(st(1).openings.filter(o => o.kind === 'window' && o.sure).length, 3)   // two of them over the kitchen worktops
  // one bathtub, a fireplace, wardrobes
  assert.equal(house.items.filter(i => i.k === 'model' && i.name === 'bathtub').length, 1)
  assert.ok(house.items.some(i => i.k === 'box' && i.m === 'flame' && i.f === 1))
  assert.ok(house.items.filter(i => i.k === 'tall').length >= 4)
  // stairs: a path over every tread between each pair of storeys, ending on real floor one storey up
  for (const base of [0, 1] as const) {
    const path = house.stairs.path[base], steps = house.items.find(i => i.k === 'steps' && i.f === base)
    assert.ok(path && steps && steps.k === 'steps'); assert.equal(path.length, steps.treads.length + 1)
    assert.ok(Math.abs(path[path.length - 1][2] * house.stairs.step - 3.05) < .25, 'the last tread is one riser below the next floor')
    const [ex, ey] = house.stairs.exit[base], up = st(base + 1)
    assert.ok(up.rooms.some(r => !r.outdoor && !r.void && r.tiles.some(t => ex > t[0] && ex < t[2] && ey > t[1] && ey < t[3])), 'the top of the stair is on a floor')
    assert.ok(house.stairs.trigger[base] && house.stairs.down![base + 1])
  }
  // windows, railings and the double-height space stop a walker
  assert.ok(house.floors[2].rects.length > 5)
})
