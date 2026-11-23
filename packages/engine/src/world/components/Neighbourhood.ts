import * as THREE from 'three'
import { X, Z, H, LEVEL, STOREY } from '../units'

// What stands around the house, built from house.site: the other unit of a twin house (a mirror image of this one),
// the plot with its hedge, the street and sidewalks, rows of neighbouring houses, and trees. Illustrative massing —
// it gives the windows and balconies something to look at; it is not a survey of the real street.
export default class Neighbourhood {
  [key: string]: any
  constructor(world) {
    const house = world.house, site = house.site
    this.models = []                                     // placements for Furniture: { k: 'model', name, r, h, rot, f: 0, outdoor, uniform }
    if (!site) return
    const have = (n: string) => !!world.experience.resources.items[n]
    const place = (name: string, r: number[], h: number, rot: number) => this.models.push({ k: 'model', name, r, h, rot, f: 0, outdoor: true, uniform: true })
    const b = world.batcher, G = LEVEL[0]                 // ground = the ground storey's floor level
    let seed = 7; for (const c of house.id) seed = (seed * 31 + c.charCodeAt(0)) % 2147483647
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), pick = (a: any[]) => a[Math.floor(rnd() * a.length)]

    // this building's footprint (all storeys), and the twin's
    const own = [0, 1, 2].map(f => bbox(house.floors[f].walls)).filter(Boolean) as number[][]
    if (!own.length) return
    let B = [Math.min(...own.map(o => o[0])), Math.min(...own.map(o => o[1])), Math.max(...own.map(o => o[2])), Math.max(...own.map(o => o[3]))]
    const tw = site.twin
    const mx = (x: number) => 2 * tw.at - x
    if (tw) {
      for (const f of [0, 1, 2]) {
        const fl = house.floors[f]; if (!fl.walls.length) continue
        b.at('outdoor', 0, LEVEL[f])
        b.extrude(fl.walls.map(p => [...p].reverse().map(([x, y]) => [mx(x), y])), 0, H, 'wall')
        for (const [x1, y1, x2, y2, sill, head] of fl.glass) {
          const r = [mx(x2), y1, mx(x1), y2]
          if (sill > 0) b.box(r[0], r[1], r[2], r[3], 0, sill, 'wall'); b.box(r[0], r[1], r[2], r[3], head, H, 'wall')
          b.box(r[0], r[1], r[2], r[3], sill, head, 'blackGlass')
        }
        // floor plate and roof of the twin, from this unit's indoor rooms mirrored
        for (const rm of fl.rooms.slice(0, fl.indoor)) { b.box(mx(rm[4]), rm[3], mx(rm[2]), rm[5], -.25, 0, 'ceil'); if (f === 2) b.box(mx(rm[4]) - 12, rm[3] - 12, mx(rm[2]) + 12, rm[5] + 12, H, H + .3, 'ceil') }
      }
      B = [Math.min(B[0], mx(B[2])), B[1], Math.max(B[2], mx(B[0])), B[3]]
    }

    // local frame: u runs along the street, v away from it (v = 0 at the building's street face)
    const alongX = site.street[0] === 'y', sign = site.street[1] === '-' ? 1 : -1
    const u1 = alongX ? B[0] : B[1], u2 = alongX ? B[2] : B[3]
    const face = alongX ? (sign > 0 ? B[1] : B[3]) : (sign > 0 ? B[0] : B[2]), depth = alongX ? B[3] - B[1] : B[2] - B[0]
    const R = (ua: number, va: number, ub: number, vb: number) => { const a = face + sign * va, c = face + sign * vb; return alongX ? [Math.min(ua, ub), Math.min(a, c), Math.max(ua, ub), Math.max(a, c)] : [Math.min(a, c), Math.min(ua, ub), Math.max(a, c), Math.max(ua, ub)] }
    const box = (ua: number, va: number, ub: number, vb: number, y0: number, y1: number, key: string) => { const r = R(ua, va, ub, vb); b.box(r[0], r[1], r[2], r[3], y0, y1, key) }
    const P = (u: number, v: number) => { const a = face + sign * v; return alongX ? [u, a] : [a, u] }
    b.at('outdoor', 0, G)

    const FRONT = 520, BACK = 650, SIDE = 330, WALK = 220, ROAD = 720
    const pu1 = u1 - SIDE, pu2 = u2 + SIDE, W = pu2 - pu1, pv1 = -FRONT, pv2 = depth + BACK
    // ground: lawn everywhere, the street and its sidewalks
    box(pu1 - 3 * W - 2000, pv1 - WALK - ROAD - WALK - 6000, pu2 + 3 * W + 2000, pv2 + 6000, -.12, -.05, 'grass')
    box(pu1 - 3 * W - 2000, pv1 - WALK, pu2 + 3 * W + 2000, pv1, -.05, .04, 'paver')
    box(pu1 - 3 * W - 2000, pv1 - WALK - ROAD, pu2 + 3 * W + 2000, pv1 - WALK, -.05, -.01, 'asphalt')
    box(pu1 - 3 * W - 2000, pv1 - WALK - ROAD - WALK, pu2 + 3 * W + 2000, pv1 - WALK - ROAD, -.05, .04, 'paver')

    const TREES = ['nbTreeOlive', 'nbTreeFicus', 'nbTreeCypress'].filter(have)
    const tree = (u: number, v: number, s = 1) => {
      const [x, y] = P(u, v)
      if (TREES.length) { const name = pick(TREES), h = (name === 'nbTreeCypress' ? 8 : name === 'nbTreeFicus' ? 7 : 5) * (.85 + rnd() * .3) * s, w = name === 'nbTreeCypress' ? 420 : 560 * s; place(name, [x - w / 2, y - w / 2, x + w / 2, y + w / 2], h, rnd() * Math.PI * 2); return }
      const h = (2.4 + rnd() * 1.4) * s
      b.box(x - 9, y - 9, x + 9, y + 9, 0, h, 'walnut')
      for (let i = 0; i < 4; i++) { const r = (1.1 + rnd() * .9) * s, g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, .82, 1); g.translate(X(x + (rnd() - .5) * 140 * s), G + h + r * .5 + rnd() * .7, Z(y + (rnd() - .5) * 140 * s)); b.add(g, 'leaf') }
    }
    const hedge = (ua: number, va: number, ub: number, vb: number, h = 1.5) => box(ua, va, ub, vb, 0, h, 'plant')

    // this plot: hedges on the sides and the back, trees in the garden
    hedge(pu1, pv1, pu1 + 45, pv2); hedge(pu2 - 45, pv1, pu2, pv2); hedge(pu1, pv2 - 45, pu2, pv2)
    tree(pu1 + 150, depth + BACK - 220); tree(pu2 - 160, depth + BACK - 260, 1.15); tree(pu1 + 170, -FRONT + 170, .85)

    // a neighbouring house on the plot [a, a + W] × [v0, v0 + dir·…]; `dir` +1 builds away from our street, -1 across it
    const HOUSES = ['nbHouseA', 'nbHouseB', 'nbHouseC'].filter(have)
    const toStreet = (dir: number) => (alongX ? Math.atan2(0, -sign * dir) : Math.atan2(-sign * dir, 0))       // yaw facing its street
    const neighbour = (a: number, v0: number, dir: number) => {
      if (HOUSES.length) {
        const w = W * (.62 + rnd() * .12), d = 1000 + rnd() * 300, off = (W - w) * (.3 + rnd() * .4), set = 430 + rnd() * 140
        const r = R(a + off, v0 + dir * set, a + off + w, v0 + dir * (set + d))
        place(pick(HOUSES), r, 7 + rnd() * 2.5, toStreet(dir) + (rnd() < .5 ? 0 : Math.PI))
        const back = v0 + dir * (set + d + 500)
        hedge(a, Math.min(v0, back), a + 40, Math.max(v0, back)); hedge(a + W - 40, Math.min(v0, back), a + W, Math.max(v0, back))
        tree(a + 120 + rnd() * (W - 240), v0 + dir * (set + d + 200 + rnd() * 200), .8 + rnd() * .5)
        if (rnd() < .6) tree(a + 100 + rnd() * (W - 200), v0 + dir * (140 + rnd() * 140), .7 + rnd() * .3)
        return
      }
      const wall = pick(['wall', 'wall', 'plasterWarm', 'plasterGrey', 'stone']), n = rnd() < .4 ? 3 : 2
      const w = W * (.5 + rnd() * .2), d = 900 + rnd() * 420, off = (W - w) * (.3 + rnd() * .4), set = 420 + rnd() * 160
      const ua = a + off, ub = ua + w, va = v0 + dir * set, vb = va + dir * d
      const lo = Math.min(va, vb), hi = Math.max(va, vb), front = dir > 0 ? lo : hi      // façade towards its street
      for (let f = 0; f < n; f++) {
        const inset = f === n - 1 && n > 1 ? 140 + rnd() * 160 : 0, y0 = f * STOREY
        const fu1 = ua + (rnd() < .5 ? inset : 0), fu2 = ub - (inset && fu1 === ua ? inset : 0)
        box(fu1, lo, fu2, hi, y0, y0 + STOREY, f === n - 1 && rnd() < .3 ? 'walnut' : wall)
        // window bands on the street façade and the garden façade
        for (const side of [front, front === lo ? hi : lo]) { const t = side === lo ? -6 : 6; const m = 90 + rnd() * 120; box(fu1 + m, side + Math.min(0, t), fu2 - m, side + Math.max(0, t), y0 + (f === 0 ? .1 : .9), y0 + 2.5, 'blackGlass') }
        if (f === n - 1) box(fu1 - 40, lo - 40, fu2 + 40, hi + 40, y0 + STOREY, y0 + STOREY + .25, 'ceil')
      }
      // a pergola or a balcony slab on some
      if (rnd() < .6) { const pv = dir > 0 ? hi : lo - 300; box(ua + 60, pv, ub - 60, pv + 300, STOREY - .2, STOREY, 'ceil'); for (const u of [ua + 80, ub - 80]) box(u - 8, pv + 280 * (dir > 0 ? 1 : 0), u + 8, pv + 280 * (dir > 0 ? 1 : 0) + 16, 0, STOREY - .2, 'metal') }
      const back = v0 + dir * (set + d + 500)
      hedge(a, Math.min(v0, back), a + 40, Math.max(v0, back)); hedge(a + W - 40, Math.min(v0, back), a + W, Math.max(v0, back))
      tree(a + 120 + rnd() * (W - 240), v0 + dir * (set + d + 180 + rnd() * 200), .8 + rnd() * .5)
      if (rnd() < .6) tree(a + 100 + rnd() * (W - 200), v0 + dir * (120 + rnd() * 160), .7 + rnd() * .3)
    }
    // same side of the street, across it, and the row behind
    for (const k of [-3, -2, -1, 1, 2, 3]) neighbour(pu1 + k * W, pv1, 1)
    for (const k of [-3, -2, -1, 0, 1, 2, 3]) neighbour(pu1 + k * W + W * .35, pv1 - WALK - ROAD - WALK, -1)
    for (const k of [-3, -2, -1, 0, 1, 2, 3]) neighbour(pu1 + k * W - W * .2, pv2 + 2600, -1)
    // parked cars along both kerbs, street lamps on the far sidewalk
    const CARS = ['nbCarSuv', 'nbCarSedan'].filter(have)
    if (CARS.length) for (let u = pu1 - 2.5 * W; u < pu2 + 2.5 * W; u += 700 + rnd() * 900) {
      const near = rnd() < .5, v = near ? pv1 - WALK - 120 : pv1 - WALK - ROAD + 120, r = R(u, v - 95, u + 450, v + 95)
      place(pick(CARS), r, 1.6, (alongX ? 0 : Math.PI / 2) + (near ? 0 : Math.PI))        // the models' length runs along x
    }
    if (have('nbLamp')) for (let u = pu1 - 3 * W + 300; u < pu2 + 3 * W; u += 2200) { const [x, y] = P(u, pv1 - WALK - ROAD - WALK * .35); place('nbLamp', [x - 120, y - 120, x + 120, y + 120], 6, alongX ? 0 : Math.PI / 2) }
    // street trees
    for (let u = pu1 - 3 * W; u < pu2 + 3 * W; u += 900 + rnd() * 300) { tree(u, pv1 - WALK * .5, .75); tree(u + 400, pv1 - WALK - ROAD - WALK * .5, .75) }
  }
  dispose() {}
}

function bbox(polys: number[][][]) {
  if (!polys.length) return null
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const p of polys) for (const [x, y] of p) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y }
  return [x1, y1, x2, y2]
}
