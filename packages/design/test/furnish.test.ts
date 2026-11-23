import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse, type House } from '@planwalk/house'
import { applyEdits, carryDesign, changeReport, editKey, emptyDesign, itemRef, parseDesign, PX_PER_CM, type AddEdit, type Design, type ItemEdit } from '../src'

const base = parseHouse(JSON.parse(readFileSync(new URL('../../../storage/houses/auto-twin/house.json', import.meta.url), 'utf8')))
type Model = Extract<House['items'][number], { k: 'model' }>
const models = (h: House, f: number, name: string) => h.items.filter((i): i is Model => i.k === 'model' && i.f === f && i.name === name)
const sofa = models(base, 1, 'sofa')[0], chair = models(base, 1, 'armchair')[0]

test('every movable piece of the plan has a key; plumbed-in pieces do not', () => {
  const { house, itemKeys } = applyEdits(base, {})
  assert.equal(itemKeys.length, house.items.length)
  house.items.forEach((it, i) => {
    if (it.k !== 'model') assert.equal(itemKeys[i], null)
    else if (['toilet', 'bathtub', 'vanity', 'island'].includes(it.name)) assert.equal(itemKeys[i], null)
    else assert.equal(itemKeys[i], `item:f${it.f}.${itemRef(it)}`)
  })
  assert.equal(new Set(itemKeys.filter(Boolean)).size, itemKeys.filter(Boolean).length, 'keys are unique')
})

test('move, turn and remove pieces of the plan; the base is untouched', () => {
  const mv: ItemEdit = { k: 'item', floor: 1, ref: itemRef(sofa), dx: 80, dy: -40, turn: 1 }
  const rm: ItemEdit = { k: 'item', floor: 1, ref: itemRef(chair), dx: 0, dy: 0, remove: true }
  const before = JSON.stringify(base)
  const r = applyEdits(base, { [editKey(mv)]: mv, [editKey(rm)]: rm })
  assert.equal(JSON.stringify(base), before)
  assert.deepEqual(r.issues, [])
  assert.equal(r.house.items.length, base.items.length - 1)
  const moved = r.house.items[r.itemKeys.indexOf(editKey(mv))] as Model
  const w = sofa.r[2] - sofa.r[0], h = sofa.r[3] - sofa.r[1]
  assert.ok(Math.abs((moved.r[0] + moved.r[2]) / 2 - ((sofa.r[0] + sofa.r[2]) / 2 + 80)) < 1e-6)
  assert.ok(Math.abs((moved.r[2] - moved.r[0]) - h) < 1e-6 && Math.abs((moved.r[3] - moved.r[1]) - w) < 1e-6, 'a quarter turn swaps the footprint')
  assert.ok(Math.abs(moved.rot - (sofa.rot + Math.PI / 2)) < 1e-9)
  assert.equal(r.itemKeys.indexOf(editKey(rm)), -1)
  // the key of a moved piece stays the one from the plan, so it can be moved again
  assert.equal(editKey(mv), `item:f1.${itemRef(sofa)}`)
})

test('new pieces: real size, turned, outdoors on request; unknown ones are refused', () => {
  const a: AddEdit = { k: 'add', floor: 0, id: 'p1', thing: 'parasol', x: 500, y: 1900, turn: 0, out: true }
  const b: AddEdit = { k: 'add', floor: 1, id: 'd1', thing: 'desk', x: 400, y: 400, turn: 1 }
  const c: AddEdit = { k: 'add', floor: 1, id: 'x', thing: 'spaceship', x: 0, y: 0, turn: 0 }
  const r = applyEdits(base, { [editKey(a)]: a, [editKey(b)]: b, [editKey(c)]: c })
  const par = r.house.items[r.itemKeys.indexOf('add:f0.p1')] as Model, desk = r.house.items[r.itemKeys.indexOf('add:f1.d1')] as Model
  assert.equal(par.layer, 'outdoor'); assert.equal(par.name, 'gardenParasol'); assert.ok(Math.abs((par.r[2] - par.r[0]) / PX_PER_CM - 280) < .01)
  assert.equal(desk.layer, undefined); assert.ok(Math.abs((desk.r[2] - desk.r[0]) / PX_PER_CM - 65) < .01 && Math.abs((desk.r[3] - desk.r[1]) / PX_PER_CM - 140) < .01)
  assert.deepEqual(r.issues.map(i => i.key), ['add:f1.x'])
  parseHouse(JSON.parse(JSON.stringify({ ...r.house })))                // still a valid house@1
})

test('the design schema accepts furniture edits; the report says them in words', () => {
  const mv: ItemEdit = { k: 'item', floor: 1, ref: itemRef(sofa), dx: 120, dy: 0 }
  const rm: ItemEdit = { k: 'item', floor: 1, ref: itemRef(chair), dx: 0, dy: 0, remove: true }
  const add: AddEdit = { k: 'add', floor: 0, id: 'p1', thing: 'lounger', x: 500, y: 2400, turn: 0, out: true }
  const d: Design = parseDesign({ ...emptyDesign(), edits: { [editKey(mv)]: mv, [editKey(rm)]: rm, [editKey(add)]: add } })
  const r = changeReport(base, d)
  assert.equal(r.counts.furniture, 3)
  const what = r.changes.map(c => c.what)
  assert.ok(what.some(w => /^ספה: (הזזה של 121 ס"מ|מעבר אל )/.test(w)), what.join(' | '))
  assert.ok(what.includes('כורסה: הסרה מהתוכנית')); assert.ok(what.some(w => w.startsWith('נוסף: מיטת שיזוף')))
  assert.ok(r.changes.every(c => c.rect && c.kind === 'furniture'))
  assert.equal(r.cost.difference, 0)
})

test('a new plan: a moved piece follows its piece; what is gone is listed; added pieces stay', () => {
  const next: House = JSON.parse(JSON.stringify(base))
  const s2 = models(next, 1, 'sofa')[0]; s2.r = [s2.r[0] + 12, s2.r[1], s2.r[2] + 12, s2.r[3]]            // redrawn 12 px to the side
  next.items = next.items.filter(i => !(i.k === 'model' && i.f === 1 && i.name === 'armchair' && itemRef(i) === itemRef(chair)))
  const mv: ItemEdit = { k: 'item', floor: 1, ref: itemRef(sofa), dx: 80, dy: 0 }, ch: ItemEdit = { k: 'item', floor: 1, ref: itemRef(chair), dx: 30, dy: 0 }
  const add: AddEdit = { k: 'add', floor: 0, id: 'p1', thing: 'hedge', x: 500, y: 2400, turn: 0, out: true }
  const c = carryDesign(base, next, { ...emptyDesign(), edits: { [editKey(mv)]: mv, [editKey(ch)]: ch, [editKey(add)]: add } })
  assert.ok(c.design.edits[`item:f1.${itemRef(s2)}`], JSON.stringify(Object.keys(c.design.edits)))
  assert.ok(c.design.edits['add:f0.p1'])
  assert.equal(c.dropped.length, 1); assert.match(c.dropped[0].what, /כורסה/)
  assert.deepEqual(applyEdits(next, c.design.edits as never).issues, [])
})
