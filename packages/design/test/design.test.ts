import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse } from '@planwalk/house'
import { DesignDoc, emptyDesign, parseDesign, parseTarget, resolveFinish, storeyLooks, targetKey, validate, finishesFor, BASE, PART_IDS, finish } from '../src/index'

const house = parseHouse(JSON.parse(readFileSync(new URL('../../../storage/houses/twin-a/house.json', import.meta.url), 'utf8')))

test('targets round-trip', () => {
  assert.equal(targetKey('walls'), 'walls@all')
  assert.equal(targetKey('floor', { floor: 2 }), 'floor@f2')
  assert.equal(targetKey('walls', { floor: 1, room: 6 }), 'walls@f1.r6')
  assert.deepEqual(parseTarget('walls@f1.r6'), { part: 'walls', floor: 1, room: 6 })
  assert.equal(parseTarget('roof@all'), null)
  assert.equal(parseTarget('walls@f3'), null)
})

test('schema rejects unknown targets', () => {
  assert.throws(() => parseDesign({ format: 'design@1', finishes: { 'sofa@all': 'wood-oak' } }))
  assert.throws(() => parseDesign({ format: 'design@0', finishes: {} }))
  assert.deepEqual(parseDesign({ format: 'design@1' }).finishes, {})
})

test('the most specific choice wins', () => {
  const d = parseDesign({ format: 'design@1', finishes: { 'walls@all': 'paint-greige', 'walls@f2': 'paint-sage', 'walls@f2.r0': 'paint-mist-blue' } })
  assert.deepEqual(resolveFinish(d, 'walls', { floor: 2, room: 0 }), { id: 'paint-mist-blue', from: 'room' })
  assert.deepEqual(resolveFinish(d, 'walls', { floor: 2, room: 3 }), { id: 'paint-sage', from: 'floor' })
  assert.deepEqual(resolveFinish(d, 'walls', { floor: 1 }), { id: 'paint-greige', from: 'all' })
  assert.deepEqual(resolveFinish(d, 'floor', { floor: 1 }), { id: BASE.floor, from: 'base' })
})

test('storey looks for the engine: null where the base stays', () => {
  const d = parseDesign({ format: 'design@1', finishes: { 'joinery@all': 'lacquer-navy', 'floor@f2': 'wood-oak' } })
  const L = storeyLooks(d)
  assert.equal(L.joinery?.every(l => l?.color === '#22355c'), true)
  assert.deepEqual(L.floor?.map(l => l?.texture ?? null), [null, null, 'oak'])
  assert.equal(L.walls, undefined)
})

test('every part has base finishes from its own allowed list', () => {
  for (const p of PART_IDS) {
    assert.ok(finish(BASE[p]), p)
    assert.ok(finishesFor(p).some(f => f.id === BASE[p]), p)
  }
})

test('rules: wrong category is an error, wet rooms warn, unknown rooms error', () => {
  const bath = house.floors[2].rooms.findIndex(r => r[0].includes('מקלחת'))
  const d = parseDesign({ format: 'design@1', finishes: {
    'worktop@all': 'paint-sage', [`floor@f2.r${bath}`]: 'wood-oak', 'walls@f1.r99': 'paint-greige', 'frames@all': 'metal-bronze' } })
  const issues = validate(d, house)
  assert.equal(issues.find(i => i.target === 'worktop@all')?.level, 'error')
  assert.equal(issues.find(i => i.target === `floor@f2.r${bath}`)?.level, 'warning')
  assert.equal(issues.find(i => i.target === 'walls@f1.r99')?.level, 'error')
  assert.equal(issues.some(i => i.target === 'frames@all'), false)
})

test('undo and redo', () => {
  const doc = new DesignDoc(emptyDesign())
  assert.equal(doc.dirty, false)
  doc.set('walls@all', 'paint-sage')
  doc.apply([{ target: 'floor@all', id: 'wood-oak' }, { target: 'joinery@all', id: 'lacquer-navy' }])
  assert.equal(doc.dirty, true)
  assert.equal(doc.set('walls@all', 'paint-sage'), false)            // no-op isn't an undo step
  doc.undo()
  assert.deepEqual(doc.design.finishes, { 'walls@all': 'paint-sage' })
  doc.undo()
  assert.deepEqual(doc.design.finishes, {})
  assert.equal(doc.canUndo, false)
  doc.redo(); doc.redo()
  assert.deepEqual(doc.design.finishes, { 'walls@all': 'paint-sage', 'floor@all': 'wood-oak', 'joinery@all': 'lacquer-navy' })
  doc.set('walls@all', null)
  assert.equal(doc.canRedo, false)
  assert.equal('walls@all' in doc.design.finishes, false)
  doc.markSaved(); assert.equal(doc.dirty, false)
})
