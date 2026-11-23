import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse, type House } from '@planwalk/house'
import { applyEdits, carryDesign, editKey, emptyDesign, findPartition, matchRooms, planChanges, type Design, type WallEdit } from '../src'

const base = parseHouse(JSON.parse(readFileSync(new URL('../../../storage/houses/twin-a/house.json', import.meta.url), 'utf8')))
const copy = (h: House): House => JSON.parse(JSON.stringify(h))

test('the same plan twice: nothing changed', () => {
  const r = planChanges(base, copy(base))
  assert.deepEqual(r.changes, []); assert.equal(r.area.before, r.area.after)
})

test('a moved wall shows as rooms that grew and shrank, and as one wall that moved', () => {
  const p = findPartition(base, 2, 'x', 673.8, 300); assert.ok(p.ok)
  const e: WallEdit = { k: 'wall', ...p.wall, by: 60 }
  const next = applyEdits(base, { [editKey(e)]: e }).house
  const r = planChanges(base, next)
  const rooms = r.changes.filter(c => c.kind === 'room')
  assert.ok(rooms.some(c => /גדל/.test(c.what)), JSON.stringify(r.changes)); assert.ok(rooms.some(c => /קטן/.test(c.what)))
  assert.deepEqual(r.changes.filter(c => c.kind === 'wall').map(c => c.what), ['קיר הוזז כ-60 ס"מ'])
  assert.ok(r.changes.every(c => c.storey === 2))
})

test('rooms: renamed, removed and new; openings: added, removed, widened', () => {
  const next = copy(base), fl = next.floors[1]
  const old = fl.rooms[2][0]; fl.rooms[2][0] = 'חדר עבודה'
  const gone = fl.rooms.splice(fl.indoor - 1, 1)[0]; fl.indoor--
  fl.rooms.splice(fl.indoor, 0, ['מחסן', '200 × 150', 3000, 3000, 3200, 3150]); fl.indoor++
  const g = fl.glass[0]; const removed = fl.glass.pop()!
  if (g[2] - g[0] > g[3] - g[1]) g[2] += 60; else g[3] += 60
  fl.glass.push([2000, 2000, 2120, 2012, 1, 2.2])
  const r = planChanges(base, next)
  assert.ok(r.changes.some(c => c.what.includes(`שם חדש: חדר עבודה (היה ${old})`)), JSON.stringify(r.changes.map(c => c.what)))
  assert.ok(r.changes.some(c => c.where.startsWith(gone[0]) && /הוסר/.test(c.what)))
  assert.ok(r.changes.some(c => c.where.startsWith('מחסן') && /חדר חדש/.test(c.what)))
  assert.ok(r.changes.some(c => c.kind === 'opening' && /רוחב \d+ ← \d+/.test(c.what)))
  assert.ok(r.changes.some(c => c.kind === 'opening' && /חדש ברוחב 121/.test(c.what)))
  assert.ok(r.changes.some(c => c.kind === 'opening' && /הוסר/.test(c.what) && c.rect[0] === removed[0]))
  // rooms after the removed one are still matched to themselves
  const m = matchRooms(base, next, 1); assert.equal(m[2], 2); assert.equal(m[base.floors[1].indoor - 1], null)
})

test('a client design travels: room finishes follow their room, what no longer fits is listed', () => {
  const next = copy(base), fl = next.floors[1]
  // the new plan lists the rooms in another order and drops one
  const lost = fl.rooms.splice(1, 1)[0]; fl.indoor--
  const moved = fl.rooms.splice(0, 1)[0]; fl.rooms.splice(fl.indoor - 1, 0, moved)
  const p = findPartition(base, 2, 'x', 673.8, 300); assert.ok(p.ok)
  const e: WallEdit = { k: 'wall', ...p.wall, by: 40 }
  // a window edit the base plan accepts
  const wi = base.floors[1].glass.findIndex((_, i) => !applyEdits(base, { [`window:f1.${i}`]: { k: 'window', floor: 1, index: i, sill: .6 } }).issues.some(x => x.level === 'error')); assert.ok(wi >= 0)
  const wk = `window:f1.${wi}`
  const d: Design = { ...emptyDesign(), finishes: { 'floor@all': 'wood-oak', 'floor@f1.r0': 'wood-oak', 'walls@f1.r1': 'paint-sage', 'walls@f1.r3': 'paint-sage' }, edits: { [editKey(e)]: e, [wk]: { k: 'window', floor: 1, index: wi, sill: .6 } } }
  const c = carryDesign(base, next, d)
  assert.equal(c.design.finishes['floor@all'], 'wood-oak')
  assert.equal(c.design.finishes[`floor@f1.r${fl.indoor - 1}`], 'wood-oak', JSON.stringify(c.design.finishes))
  assert.equal(c.design.finishes['walls@f1.r1'], 'paint-sage')                       // was r3: one room before it is gone, one moved to the end
  assert.equal(c.dropped.length, 1, JSON.stringify(c.dropped)); assert.ok(c.dropped[0].what.includes(lost[0]))
  assert.ok(c.design.edits[editKey(e)]); assert.ok(c.design.edits[wk])
  // the wall the client moved is gone from the next plan → that edit is dropped, with a reason
  const next2 = applyEdits(base, { [editKey(e)]: { ...e, by: 120 } }).house
  const c2 = carryDesign(base, next2, d)
  assert.ok(!c2.design.edits[editKey(e)]); assert.ok(c2.dropped.some(x => /הקיר שהזזתם/.test(x.what)))
})
