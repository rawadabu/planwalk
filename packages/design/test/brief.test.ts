import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHouse } from '@planwalk/house'
import { applyEdits, DEFAULT_BRIEF, firstDesign, parseBrief, parseDesign, thing, validate, type AddEdit, type Brief } from '../src'

const house = parseHouse(JSON.parse(readFileSync(new URL('../../../storage/houses/auto-twin/house.json', import.meta.url), 'utf8')))
const inPoly = (p: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
const adds = (b: Brief) => Object.values(firstDesign(house, b).edits).filter((e): e is AddEdit => e.k === 'add')
const count = (list: AddEdit[], id: string) => list.filter(e => e.thing === id).length

test('answers are validated: unknown values fall back, lists are cleaned', () => {
  const b = parseBrief({ style: 'baroque', kids: 99, living: ['tv', 'tv', 'disco'], level: 'full', note: '  אוהבים עץ  ' })
  assert.equal(b.style, DEFAULT_BRIEF.style); assert.equal(b.kids, 8); assert.deepEqual(b.living, ['tv']); assert.equal(b.level, 'full'); assert.equal(b.note, 'אוהבים עץ')
})

test('the first design is a valid design the house accepts, and the same answers give the same design', () => {
  for (const level of ['minimal', 'cozy', 'full'] as const) {
    const d = firstDesign(house, { ...DEFAULT_BRIEF, level, outdoor: ['dining', 'lounge', 'green', 'bbq'], workFromHome: true, accent: 'sage', floor: 'wood' })
    parseDesign(JSON.parse(JSON.stringify(d)))
    assert.deepEqual(applyEdits(house, d.edits as never).issues, [], level)
    assert.deepEqual(validate(d, house).filter(i => i.level === 'error'), [], level)
    assert.deepEqual(d, firstDesign(house, { ...DEFAULT_BRIEF, level, outdoor: ['dining', 'lounge', 'green', 'bbq'], workFromHome: true, accent: 'sage', floor: 'wood' }))
  }
})

test('nothing stands in a wall, on another piece, or in a doorway', () => {
  const d = firstDesign(house, { ...DEFAULT_BRIEF, level: 'full', outdoor: ['dining', 'lounge', 'green', 'bbq'], workFromHome: true })
  const eff = applyEdits(house, d.edits as never), px = house.source.pxPerMetre / 100
  const mine = eff.house.items.filter((_, i) => eff.itemKeys[i]?.startsWith('add:'))
  assert.ok(mine.length > 25, `only ${mine.length} pieces`)
  const flat = new Set(['homeRug', 'homePendant', 'gardenPergola', 'gardenParasol', 'nbTreeOlive', 'nbTreeFicus', 'nbTreeCypress'])            // lie under, hang over or stand around other pieces
  for (const it of mine) {
    if (it.k !== 'model') continue
    for (const x of [it.r[0] + 3, (it.r[0] + it.r[2]) / 2, it.r[2] - 3]) for (const y of [it.r[1] + 3, (it.r[1] + it.r[3]) / 2, it.r[3] - 3]) assert.ok(!house.floors[it.f].walls.some(p => inPoly(p, x, y)), `${it.name} is in a wall on storey ${it.f}`)
    if (flat.has(it.name)) continue
    for (const o of eff.house.items) {
      if (o === it || o.f !== it.f || !('r' in o) || o.k === 'opening' || (o.k === 'model' && flat.has(o.name)) || (o.k === 'box' && (o.layer === 'arch' || o.layer === 'roof' || o.layer === 'outdoor' || o.m === 'quartz'))) continue
      assert.ok(!(it.r[0] < o.r[2] - 2 && it.r[2] > o.r[0] + 2 && it.r[1] < o.r[3] - 2 && it.r[3] > o.r[1] + 2), `${it.name} overlaps ${o.k} ${'name' in o ? o.name : ''} on storey ${it.f}`)
    }
    // the way through a door: its opening carried 80 cm to both sides of the wall
    for (const o of house.items) if (o.k === 'opening' && o.f === it.f) { const h = o.r[2] - o.r[0] > o.r[3] - o.r[1], z = h ? [o.r[0], o.r[1] - 80, o.r[2], o.r[3] + 80] : [o.r[0] - 80, o.r[1], o.r[2] + 80, o.r[3]]; assert.ok(!(it.r[0] < z[2] && it.r[2] > z[0] && it.r[1] < z[3] && it.r[3] > z[1]), `${it.name} blocks a door on storey ${it.f}`) }
  }
  void px; void thing
})

test('the answers show in the result', () => {
  const cozy = adds(DEFAULT_BRIEF), bare = adds({ ...DEFAULT_BRIEF, level: 'minimal', outdoor: [] }), full = adds({ ...DEFAULT_BRIEF, level: 'full', workFromHome: true, outdoor: ['dining', 'lounge', 'green', 'bbq'] })
  assert.ok(bare.length < cozy.length && cozy.length < full.length, `${bare.length} < ${cozy.length} < ${full.length}`)
  assert.ok(count(cozy, 'tv-unit') >= 1); assert.equal(count(adds({ ...DEFAULT_BRIEF, living: [] }), 'tv-unit'), 0)
  assert.ok(count(cozy, 'nightstand') >= 3); assert.ok(count(cozy, 'rug-large') + count(cozy, 'rug-small') >= 3)
  assert.ok(count(full, 'desk') >= 1, 'someone works from home'); assert.equal(count(adds({ ...DEFAULT_BRIEF, kids: 0 }), 'desk'), 0)
  assert.ok(count(full, 'garden-table') === 1 && count(full, 'garden-chair') === 4 && count(full, 'parasol') === 1)
  assert.ok(bare.every(e => !e.out)); assert.ok(count(full, 'pergola') === 1 && count(full, 'lounger') === 2 && count(full, 'bbq') === 1)
  const d = firstDesign(house, { ...DEFAULT_BRIEF, style: 'dark-luxury', accent: 'clay', floor: 'wood' })
  assert.equal(d.finishes['joinery@all'], 'lacquer-black'); assert.equal(d.finishes['floor@all'], 'wood-oak-smoked')
  assert.ok(Object.entries(d.finishes).some(([k, v]) => /^walls@f2\.r\d+$/.test(k) && v === 'paint-clay'), 'bedroom walls take the accent')
  assert.ok(Object.entries(d.finishes).some(([k, v]) => /^floor@f\d\.r\d+$/.test(k) && v === 'tile-dark'), 'wet rooms keep tiles under a wood floor')
})
