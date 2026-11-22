import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse } from '@planwalk/house'
import { applyEdits, editKey, findPartition, windowInfo, PX_PER_CM, DesignDoc, emptyDesign, parseDesign, parseTarget, resolveFinish, storeyLooks, roomLooks, targetKey, validate, finishesFor, BASE, PART_IDS, finish } from '../src/index'

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
  assert.deepEqual(parseDesign({ format: 'design@1' }).edits, {})
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

test('room looks: only floor, walls and ceiling, per room', () => {
  const d = parseDesign({ format: 'design@1', finishes: { 'walls@f1.r6': 'paint-sage', 'floor@f2.r0': 'wood-oak', 'walls@all': 'paint-greige', 'joinery@f1.r1': 'lacquer-navy' } })
  const L = roomLooks(d)
  assert.deepEqual(L.map(l => [l.part, l.floor, l.room]).sort(), [['floor', 2, 0], ['walls', 1, 6]])
  assert.equal(validate(d, house).find(i => i.target === 'joinery@f1.r1')?.level, 'error')
})

test('window: wider, centred, the wall opening follows; base untouched', () => {
  const before = JSON.stringify(house)
  const w0 = windowInfo(house, 2, 0)!
  const e = { k: 'window' as const, floor: 2 as const, index: 0, width: w0.width + 40, sill: .9 }
  const { house: h, issues } = applyEdits(house, { [editKey(e)]: e })
  assert.deepEqual(issues, [])
  const w1 = windowInfo(h, 2, 0)!
  assert.equal(w1.width, w0.width + 40); assert.equal(w1.sill, .9)
  const [x1, , x2] = h.floors[2].glass[0], [ox1, , ox2] = house.floors[2].glass[0]
  assert.ok(Math.abs((x1 + x2) - (ox1 + ox2)) < 1e-6, 'stays centred')
  // the wall polygon's opening edges moved with it
  const vs = h.floors[2].walls.flat().filter(v => v[1] > 100 && v[1] < 135).map(v => v[0])
  const grew = (Math.max(...vs.filter(x => x > x1 - 8 && x < x1 + 8)) - Math.min(...vs.filter(x => x > x2 - 8 && x < x2 + 8)))
  assert.ok(vs.some(x => Math.abs(x - x1) < 6) && vs.some(x => Math.abs(x - x2) < 6), 'opening edges sit at the new window ends')
  assert.ok(Number.isFinite(grew))
  assert.equal(JSON.stringify(house), before)
})

test('window: impossible sizes are refused', () => {
  const tooSmall = applyEdits(house, { a: { k: 'window', floor: 2, index: 0, width: 20 } }).issues
  assert.equal(tooSmall[0]?.level, 'error')
  const tooWide = applyEdits(house, { a: { k: 'window', floor: 2, index: 0, width: 900 } }).issues
  assert.equal(tooWide[0]?.level, 'error')
  const badHead = applyEdits(house, { a: { k: 'window', floor: 2, index: 0, sill: 1.2, head: 1.4 } }).issues
  assert.equal(badHead[0]?.level, 'error')
})

test('partition: found from a face, moves, rooms and labels follow', () => {
  // the wall between the two kids' bedrooms and the corridor/laundry on the top floor: find any interior partition
  const fl = house.floors[2]
  let found: ReturnType<typeof findPartition> | null = null
  outer: for (const p of fl.walls) for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length]
    if (Math.abs(ax - bx) < .5 && Math.abs(by - ay) > 60) { const r = findPartition(house, 2, 'x', ax, (ay + by) / 2); if (r.ok) { found = r; break outer } }
  }
  assert.ok(found && found.ok, 'an interior partition exists')
  if (!found || !found.ok) return
  const e = { k: 'wall' as const, ...found.wall, by: 20 }
  const { house: h, issues } = applyEdits(house, { [editKey(e)]: e })
  assert.equal(issues.filter(i => i.level === 'error').length, 0, JSON.stringify(issues))
  const moved = h.floors[2].walls.flat().filter(v => Math.abs(v[0] - (found!.ok ? found!.wall.a : 0) - 20 * PX_PER_CM) < 1e-6)
  assert.ok(moved.length >= 2)
  assert.notDeepEqual(h.floors[2].rooms, house.floors[2].rooms)
})

test('outside walls cannot move', () => {
  const all = house.floors[2].walls.flat(), minX = Math.min(...all.map(v => v[0]))
  const v = all.find(q => q[0] === minX)!
  const r = findPartition(house, 2, 'x', minX, v[1] + 5)
  assert.equal(r.ok, false)
})

test('edits undo like finishes', () => {
  const doc = new DesignDoc(emptyDesign())
  const e = { k: 'window' as const, floor: 2 as const, index: 0, sill: .8 }
  doc.setEdit(editKey(e), e)
  assert.equal(Object.keys(doc.design.edits).length, 1)
  doc.undo(); assert.deepEqual(doc.design.edits, {})
  doc.redo(); assert.equal(doc.design.edits[editKey(e)]?.k, 'window')
})

test('partition with faces of different lengths moves as one wall', () => {
  const r = findPartition(house, 2, 'x', 673.8, 300)
  assert.ok(r.ok)
  if (!r.ok) return
  const e = { k: 'wall' as const, ...r.wall, by: 30 }
  const out = applyEdits(house, { [editKey(e)]: e })
  assert.equal(out.issues.filter(i => i.level === 'error').length, 0, JSON.stringify(out.issues))
  const kids = out.house.floors[2].rooms[2], corridor = out.house.floors[2].rooms[3]
  assert.ok(kids[2] > house.floors[2].rooms[2][2] && corridor[4] > house.floors[2].rooms[3][4], 'kids room shrinks, corridor grows')
})
