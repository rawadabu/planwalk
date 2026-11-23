import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse } from '@planwalk/house'
import { changeReport, emptyDesign, findPartition, editKey, type Design, type WallEdit } from '../src'

const house = parseHouse(JSON.parse(readFileSync(new URL('../../../storage/houses/twin-a/house.json', import.meta.url), 'utf8')))

test('no changes: an empty report and no cost difference', () => {
  const r = changeReport(house, emptyDesign())
  assert.deepEqual(r.changes, []); assert.equal(r.cost.difference, 0); assert.equal(r.note, null)
})

test('finishes are reported per room, floor and house — and the base finish is not a change', () => {
  const d: Design = { ...emptyDesign(), finishes: { 'floor@f1.r6': 'wood-oak', 'walls@f2': 'paint-sage', 'joinery@all': 'wood-walnut' } }
  const r = changeReport(house, d)
  assert.equal(r.counts.finish, 2)
  const room = r.changes.find(c => c.where.startsWith(house.floors[1].rooms[6][0]))!
  assert.match(room.what, /רצפה/); assert.ok(room.rect); assert.equal(room.storey, 1)
  assert.ok(r.changes.some(c => c.where === 'כל קומה שנייה'))
  assert.ok(r.cost.difference !== 0)
})

test('a moved wall says how far, between which rooms, and where on the plan', () => {
  // a partition on the second floor
  const p = findPartition(house, 2, 'x', 673.8, 300); assert.ok(p.ok, JSON.stringify(p))
  const e: WallEdit = { k: 'wall', ...p.wall, by: 40 }
  const r = changeReport(house, { ...emptyDesign(), edits: { [editKey(e)]: e } })
  assert.equal(r.counts.wall, 1)
  assert.match(r.changes[0].what, /הוזז 40 ס"מ/); assert.match(r.changes[0].what, /גדל/)
  assert.equal(r.changes[0].kind, 'wall'); assert.ok(r.changes[0].rect)
})

test('a window edit lists only what changed', () => {
  const r = changeReport(house, { ...emptyDesign(), edits: { 'window:f2.0': { k: 'window', floor: 2, index: 0, width: 200 } } })
  assert.equal(r.counts.window, 1); assert.match(r.changes[0].what, /רוחב \d+ ← 200/); assert.doesNotMatch(r.changes[0].what, /אדן/)
})

test('walls come first, finishes last; the note travels with the report', () => {
  const p = findPartition(house, 2, 'x', 673.8, 300); assert.ok(p.ok)
  const e: WallEdit = { k: 'wall', ...p.wall, by: -30 }
  const r = changeReport(house, { ...emptyDesign(), finishes: { 'floor@all': 'wood-oak' }, edits: { [editKey(e)]: e }, note: '  נשמח לחלון גדול יותר בסלון ' })
  assert.deepEqual(r.changes.map(c => c.kind), ['wall', 'finish']); assert.equal(r.note, 'נשמח לחלון גדול יותר בסלון')
})
