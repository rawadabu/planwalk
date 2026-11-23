import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hebrew, understandCad, cadRoles, toHouse, type Cad } from '../src/index'

// the two floor plans of a twin house, cut out of an architect's permit drawing (AutoCAD 2000, layers named by pen)
const cad = JSON.parse(fs.readFileSync(new URL('../fixtures/cad/two-storey.json', import.meta.url), 'utf8')) as Cad

test('old AutoCAD Hebrew is read: keyboard fonts, numbers typed backwards, DOS code page', () => {
  assert.equal(hebrew('xkui'), 'סלון')
  assert.equal(hebrew(',fbh, eun, fbhxv ceb"n 001:1'), 'תכנית קומת כניסה בקנ"מ 1:100')
  assert.equal(hebrew('cayj 32/51 n"r'), 'בשטח 15.23 מ"ר')
  assert.equal(hebrew('T.V. 2X36W'), 'T.V. 2X36W')                    // nothing Hebrew in it: left as typed
  assert.equal(hebrew('ckhyv 51X06 x"n'), 'בליטה 60X15 ס"מ')
  assert.equal(hebrew('%%P0.00'), '±0.00')
  assert.equal(hebrew('ןוטב'), 'בטון')
  assert.match(hebrew('…”ˆ ƒ…—'), /^[א-ת ]+$/)
})

test('layers: the heaviest pen is the wall layer; doors, columns, text and dimensions by name', () => {
  const r = cadRoles(cad)
  assert.equal(r['050'], 'wall'); assert.equal(r['DOOR'], 'opening'); assert.equal(r['עמודים'], 'column'); assert.equal(r['TEXT'], 'text')
  assert.equal(r['008'], 'other')
})

const plan = understandCad(cad)
const storey = (n: number) => plan.storeys.find(s => s.storey === n)!
const room = (n: number, name: string) => storey(n).rooms.find(r => r.name === name)

test('both storeys are found by their titles and laid over each other', () => {
  assert.deepEqual(plan.storeys.map(s => s.storey), [0, 1])
  assert.match(storey(0).title!, /קומת כניסה/); assert.match(storey(1).title!, /קומה ראשונה/)
  assert.equal(plan.scale.from, 'drawing'); assert.equal(plan.scale.written, 100)
  assert.deepEqual(plan.storeys.map(s => s.side), ['left', 'left'])                        // one unit of the twin
  // the stair is in the same place on both storeys
  const [a, b] = [storey(0).stairs[0].box, storey(1).stairs[0].box]
  assert.ok(Math.abs(a[2] - b[2]) < 6 && Math.abs(a[3] - b[3]) < 6, `stairs ${a} / ${b}`)
})

test('rooms carry the names written in them, and measure what the architect wrote', () => {
  // areas written on the drawing: shelter 15.23, kitchenette 13.26, children 11.20 and 11.75
  const near = (got: number | undefined, want: number) => assert.ok(got !== undefined && Math.abs(got - want) < .15, `${got} vs ${want}`)
  near(room(0, 'ממ"ד - חדר שינה')?.area, 15.23)
  near(room(0, 'מטבחון')?.area, 13.26)
  near(room(1, 'חדר שינה ילדים 1')?.area, 11.20)
  near(room(1, 'חדר שינה ילדים 2')?.area, 11.75)
  for (const n of ['סלון', 'מטבח', 'פינת אוכל', 'מבואת כניסה', 'מקלחת']) assert.ok(room(0, n), n)
  for (const n of ['חדר שינה הורים', 'חלל ארונות', 'חדר כביסה']) assert.ok(room(1, n), n)
  assert.equal(room(1, 'חלל כפול')?.void, true)
  assert.ok(storey(0).rooms.some(r => r.outdoor && /מרפסת/.test(r.name)))
})

test('windows come from the window symbols, doors from the gaps in the walls', () => {
  const kinds = (n: number) => storey(n).openings.reduce((m, o) => ({ ...m, [o.kind]: (m[o.kind] ?? 0) + 1 }), {} as Record<string, number>)
  assert.ok(kinds(0).window >= 5 && kinds(0)['glass-door'] >= 1 && kinds(0).door >= 4, JSON.stringify(kinds(0)))
  assert.ok(kinds(1).window >= 4 && kinds(1).door >= 5, JSON.stringify(kinds(1)))
  // walls are rectangles with real thickness, none of them a stray line
  for (const s of plan.storeys) for (const p of s.walls) assert.ok(Math.min(p[2][0] - p[0][0], p[2][1] - p[0][1]) >= 1)
  assert.ok(plan.warnings.some(w => /gaps in the walls/.test(w)))
})

test('the house is built: two storeys, a stair you can climb, no third storey', () => {
  const { house } = toHouse(plan, { id: 't' })
  assert.ok(house.floors[0].rooms.length > 5 && house.floors[1].rooms.length > 5)
  assert.equal(house.floors[2].rooms.length, 0)
  assert.equal(house.entry, 0)                                                              // the visit starts at the entrance hall
  assert.ok(house.stairs.path[0]!.length > 10)
  assert.ok(house.items.some(i => i.k === 'steps'))
  assert.match(house.source.note ?? '', /CAD drawing/)
})
