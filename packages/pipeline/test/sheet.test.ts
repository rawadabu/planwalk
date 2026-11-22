import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyse } from '../src/sheet'
import { calibrate } from '../src/scale'
import { openings } from '../src/openings'
import type { PdfLayers, Path } from '../src/pdf'
import type { Label } from '../src/labels'

const rect = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
// a 600 × 400 box of 20 px walls, divided at x = 300 by a wall with a 90 px doorway (y 150–240)
const shell = [rect(0, 0, 600, 20), rect(0, 380, 600, 400), rect(0, 0, 20, 400), rect(580, 0, 600, 400)]
const divider = [rect(290, 20, 310, 150), rect(290, 240, 310, 380)]
const label = (text: string, x: number, y: number, size = 20) => ({ text, kind: 'room' as const, box: [x - 30, y - size / 2, x + 30, y + size / 2] as [number, number, number, number], size })

test('a door closes a room: two names, two rooms, each from its label', () => {
  const door = { kind: 'door' as const, box: [300, 150, 390, 240] as [number, number, number, number], axis: 'v' as const, from: 150, to: 240, at: 300, hinge: [300, 240] as [number, number], ends: [[300, 150], [390, 240]] as [[number, number], [number, number]] }
  const r = analyse([...shell, ...divider], [door], [], [label('סלון', 150, 200), label('מטבח', 450, 200)])
  const indoor = r.rooms.filter(x => !x.outdoor)
  assert.deepEqual(indoor.map(x => x.name).sort(), ['מטבח', 'סלון'])
  assert.ok(indoor.every(x => x.from === 'label'))
  const door1 = r.openings[0]
  assert.equal(door1.kind, 'door'); assert.equal(door1.axis, 'v')
  for (const x of indoor) assert.ok(Math.abs(x.area - 2.7 * 3.6 * (1 / .99318 ** 2)) < 1.2, `area ${x.area}`)
})

test('an open doorway: the space is divided between the two names along the implied wall', () => {
  const r = analyse([...shell, ...divider], [], [], [label('סלון', 150, 200), label('מטבח', 450, 200)])
  const indoor = r.rooms.filter(x => !x.outdoor)
  assert.equal(indoor.length, 2); assert.ok(indoor.every(x => x.from === 'split'))
  const living = indoor.find(x => x.name === 'סלון')!
  assert.ok(living.rect[2] <= 312, `the living room stops at the divider (${living.rect[2]})`)
})

test('a small name inside a room is a note, not a second room; the same name twice is one room', () => {
  const r = analyse(shell, [], [], [label('סלון', 150, 200), label('סלון', 450, 200), label('מזווה', 300, 100, 8)])
  assert.deepEqual(r.rooms.filter(x => !x.outdoor).map(x => x.name), ['סלון'])
  assert.ok(r.notes.some(n => n.text === 'מזווה'))
})

test('glazing onto a named outdoor space is a glass door; a short one is a window', () => {
  const walls = [rect(0, 0, 600, 20), rect(0, 0, 20, 400), rect(580, 0, 600, 400), rect(0, 380, 150, 400), rect(400, 380, 600, 400)]
  const glass = (from: number, to: number, at: number) => ({ kind: 'glazing' as const, box: [from, at - 6, to, at + 6] as [number, number, number, number], axis: 'h' as const, from, to, at })
  const r = analyse(walls, [glass(150, 400, 390)], [], [label('סלון', 300, 200), label('מרפסת', 300, 500)])
  assert.equal(r.openings[0].kind, 'glass-door'); assert.equal(r.openings[0].sill, 0)
  assert.ok(r.rooms.some(x => x.name === 'מרפסת' && x.outdoor))
})

test('scale comes from the written dimensions; a misread one is outvoted', () => {
  const lines = [{ a: [0, 100] as [number, number], b: [400, 100] as [number, number] }]
  const ticks: [number, number][] = [[0, 100], [100, 100], [250, 100], [400, 100]]
  const lab = (id: number, x: number, text: string): Label => ({ id, kind: 'dim', box: [x - 6, 92, x + 6, 97], dir: 'h', strokes: [], text })
  const s = calibrate(lines, ticks, [lab(0, 50, '300'), lab(1, 175, '450'), lab(2, 325, '100')], l => Number(l.text))!
  assert.ok(Math.abs(s.ptPerCm - 1 / 3) < 1e-6); assert.equal(s.agree, 2); assert.equal(s.used, 3)
})

test('a quarter arc on the door layer is a hinged door with its hinge at the centre of the arc', () => {
  const arc: [number, number][] = []; for (let t = 0; t <= 6; t++) { const a = (Math.PI / 2) * t / 6; arc.push([100 + 30 * Math.cos(a), 100 + 30 * Math.sin(a)]) }
  const path: Path = { layer: 'DOOR', paint: 'stroke', stroke: '#000000', fill: '#000000', width: .2, dashed: false, subs: [{ points: arc, closed: false, curved: true }] }
  const L: PdfLayers = { width: 500, height: 500, layers: ['DOOR'], paths: [path] }
  const o = openings(L).openings
  assert.equal(o.length, 1); assert.equal(o[0].kind, 'door')
  assert.ok(Math.hypot(o[0].hinge![0] - 100, o[0].hinge![1] - 100) < 1)
})
