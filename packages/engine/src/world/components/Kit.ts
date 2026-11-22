import * as THREE from 'three'
import { X, Z, H, LEVEL, STOREY } from '../units'

// Generic detailing kit: turns the `items` of house.json into geometry through the StaticBatcher.
// Every kind is a small parametric builder, so a new house only needs data, not code.
export default class Kit {
  [key: string]: any
  constructor(world) {
    this.world = world
    this.b = world.batcher
    this.lightPoints = { 0: [], 1: [], 2: [] }          // downlight positions per storey (used by the lamp pool)
    this.firePoints = []
    let seed = 11; this.rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const it of world.house.items) {
      if (it.k === 'model') continue
      const layer = it.layer || 'int'
      this.b.at(layer, it.f, LEVEL[it.f])
      const fn = this[it.k]
      if (fn) fn.call(this, it); else console.warn('unknown item kind', it.k)
    }
  }
  box({ r, y, m, rad = 0, rot }) { this.b.box(...r, y[0], y[1], m, rad, rot ? { rot: true } : undefined) }
  _run(r, h, tall) {
    const b = this.b, [x1, y1, x2, y2] = r, horiz = (x2 - x1) >= (y2 - y1), L = horiz ? x2 - x1 : y2 - y1
    const n = Math.max(1, Math.round(L / (tall ? 55 : 60))), gap = .4, top = tall ? h : h - .04
    b.box(x1 + 6, y1 + 6, x2 - 6, y2 - 6, 0, .1, 'metal'); b.box(x1 + 4, y1 + 4, x2 - 4, y2 - 4, .003, .012, 'ledStrip')
    for (let i = 0; i < n; i++) {
      const a = (horiz ? x1 : y1) + L * i / n + gap, c = (horiz ? x1 : y1) + L * (i + 1) / n - gap
      horiz ? b.box(a, y1, c, y2, .1, top, 'walnut', .004, { rot: true }) : b.box(x1, a, x2, c, .1, top, 'walnut', .004, { rot: true })
    }
    if (!tall) b.box(x1 - 1, y1 - 1, x2 + 1, y2 + 1, h - .04, h, 'quartz', .003)
  }
  base({ r, h = .92 }) { this._run(r, h, false) }
  tall({ r, h = 2.4 }) { this._run(r, h, true) }
  bed({ r: [x1, y1, x2, y2], head }) {
    const b = this.b, hx = head[0] === 'x', lo = head[1] === '1', cut = (a, c, f) => a + (c - a) * f
    b.box(x1 + 4, y1 + 4, x2 - 4, y2 - 4, 0, .08, 'metal')
    b.box(x1, y1, x2, y2, .08, .32, 'fabricD', .03)
    b.box(x1 + 1, y1 + 1, x2 - 1, y2 - 1, .32, .52, 'linen', .05)
    if (hx) {
      b.box(...(lo ? [x1 - 4, y1, x1 + 2, y2] : [x2 - 2, y1, x2 + 4, y2]), 0, 1.1, 'fabric', .03)
      b.box(...(lo ? [cut(x1, x2, .3), y1, x2 + 1, y2] : [x1 - 1, y1, cut(x1, x2, .7), y2]), .46, .58, 'fabric', .04)
      b.box(...(lo ? [x1 + 6, y1 + 6, x1 + 26, y2 - 6] : [x2 - 26, y1 + 6, x2 - 6, y2 - 6]), .52, .66, 'linen', .05)
    } else {
      b.box(...(lo ? [x1, y1 - 4, x2, y1 + 2] : [x1, y2 - 2, x2, y2 + 4]), 0, 1.1, 'fabric', .03)
      b.box(...(lo ? [x1, cut(y1, y2, .3), x2, y2 + 1] : [x1, y1 - 1, x2, cut(y1, y2, .7)]), .46, .58, 'fabric', .04)
      b.box(...(lo ? [x1 + 6, y1 + 6, x2 - 6, y1 + 26] : [x1 + 6, y2 - 26, x2 - 6, y2 - 6]), .52, .66, 'linen', .05)
    }
  }
  // ── kitchen designer modules (sheet A-05). Back on the wall, front towards `dir`; heights in metres. ──
  cabinet({ r, kind, dir }) {
    const b = this.b, alongY = dir[0] === 'x', plus = dir[1] === '+'
    const [a0, a1] = alongY ? [r[1], r[3]] : [r[0], r[2]]
    const back = alongY ? (plus ? r[0] : r[2]) : (plus ? r[1] : r[3])
    const D = alongY ? r[2] - r[0] : r[3] - r[1]
    // a box from (along p0..p1, depth d0..d1 measured from the back) and heights y0..y1
    const box = (p0, p1, d0, d1, y0, y1, key, rad = 0) => {
      const c0 = plus ? back + d0 : back - d1, c1 = plus ? back + d1 : back - d0
      alongY ? b.box(c0, p0, c1, p1, y0, y1, key, rad) : b.box(p0, c0, p1, c1, y0, y1, key, rad)
    }
    const G = .3, w = a1 - a0, am = (a0 + a1) / 2, FT = 1.9          // 3 mm gaps, 19 mm fronts (px)
    const front = (p0, p1, y0, y1, handle = true) => {
      box(p0 + G, p1 - G, D - FT, D, y0 + .0015, y1 - .0015, 'walnut')
      if (handle) box(p0 + (p1 - p0) * .32, p1 - (p1 - p0) * .32, D, D + .8, y1 - .045, y1 - .03, 'metal')
    }
    const pair = (y0, y1) => { if (w > 61) { front(a0, am, y0, y1); front(am, a1, y0, y1) } else front(a0, a1, y0, y1) }
    const BASE = .87, TALL = 2.2
    if (kind === 'upper' || kind === 'hood') {
      if (kind === 'hood') {
        box(a0 + 3, a1 - 3, 0, Math.min(D * 1.4, 50), 1.62, 1.7, 'steel', .004)
        box(am - 12, am + 12, 0, 24, 1.7, H, 'steel')
        return
      }
      box(a0 + G, a1 - G, 0, D - FT, 1.45, 2.15, 'lacquer')
      if (w > 61) { box(a0 + G, am - G, D - FT, D, 1.4515, 2.1485, 'walnut'); box(am + G, a1 - G, D - FT, D, 1.4515, 2.1485, 'walnut') }
      else box(a0 + G, a1 - G, D - FT, D, 1.4515, 2.1485, 'walnut')
      return
    }
    const tall = kind === 'fridge' || kind === 'oven' || kind === 'pantry'
    box(a0 + G, a1 - G, 0, D - 6, 0, .1, 'metal')                                        // recessed plinth
    box(a0 + G, a1 - G, 0, D - FT, .1, tall ? TALL : BASE, 'lacquer')                     // carcass
    switch (kind) {
      case 'drawers': case 'hob':
        front(a0, a1, .1, .32); front(a0, a1, .32, .58); front(a0, a1, .58, BASE)
        if (kind === 'hob') {
          box(a0 + 5, a1 - 5, 7, D - 8, BASE + .03, BASE + .036, 'blackGlass')
          for (const [u, v] of [[.3, .32], [.7, .32], [.3, .68], [.7, .68]]) box(a0 + 5 + (w - 10) * u - 5, a0 + 5 + (w - 10) * u + 5, 7 + (D - 15) * v - 5, 7 + (D - 15) * v + 5, BASE + .036, BASE + .037, 'metal')
        }
        break
      case 'sink': {
        pair(.1, BASE)
        const sw = Math.min(w - 12, 72)
        box(am - sw / 2, am + sw / 2, 10, D - 12, BASE + .01, BASE + .032, 'steel', .01)
        box(am - 1.2, am + 1.2, 4, 6.5, BASE + .03, BASE + .33, 'steel')                  // faucet
        box(am - 1, am + 1, 4, 20, BASE + .31, BASE + .335, 'steel')
        break
      }
      case 'dishwasher': front(a0, a1, .1, BASE); break
      case 'filler': box(a0, a1, D - FT, D, .1, BASE, 'walnut'); break
      case 'doors': case 'corner': pair(.1, BASE); break
      case 'fridge': pair(.1, 1.55); pair(1.55, TALL); break
      case 'oven':
        front(a0, a1, .1, .5)
        box(a0 + G + 1, a1 - G - 1, D - FT, D + .3, .52, 1.12, 'blackGlass')
        box(a0 + w * .2, a1 - w * .2, D + .3, D + 1, 1.07, 1.09, 'steel')
        box(a0 + G + 1, a1 - G - 1, D - FT, D + .3, 1.14, 1.5, 'blackGlass')
        front(a0, a1, 1.52, TALL)
        break
      case 'pantry': pair(.1, 1.4); pair(1.4, TALL); break
    }
  }
  rug({ r }) { this.b.box(...r, 0, .006, 'rug', .002) }
  slot({ r: [x1, y1, x2, y2] }) {
    const b = this.b, h = (x2 - x1) > (y2 - y1)
    b.box(x1, y1, x2, y2, H - .012, H, 'metal')
    h ? b.box(x1 + 2, (y1 + y2) / 2 - .6, x2 - 2, (y1 + y2) / 2 + .6, H - .014, H - .012, 'ledStrip')
      : b.box((x1 + x2) / 2 - .6, y1 + 2, (x1 + x2) / 2 + .6, y2 - 2, H - .014, H - .012, 'ledStrip')
  }
  slats({ r: [x1, y1, x2, y2], h }) {
    for (let y = y1; y < y2; y += 6) this.b.box(x1, y, x2, y + 3, 0, h, 'walnut', 0, { rot: true })
    this.b.box(x2 - 2, y1 - 4, x2, y2 + 4, 0, h, 'metal')
  }
  shelving({ r: [x1, y1, x2, y2] }) {
    const b = this.b
    b.box(x1, y1, x1 + 2, y2, .1, 2.5, 'walnut', 0, { rot: true })
    b.box(x1, y1, x2, y1 + 3, 0, 2.5, 'walnut', .003, { rot: true }); b.box(x1, y2 - 3, x2, y2, 0, 2.5, 'walnut', .003, { rot: true })
    b.box(x1, (y1 + y2) / 2 - 1.5, x2, (y1 + y2) / 2 + 1.5, .5, 2.5, 'walnut', .003, { rot: true })
    b.box(x1, y1, x2, y2, 0, .5, 'walnut', .004, { rot: true })
    for (const h of [.95, 1.45, 1.95, 2.45]) { b.box(x1, y1 + 3, x2, y2 - 3, h, h + .03, 'walnut', .002); b.box(x1 + 2, y1 + 3, x1 + 4, y2 - 3, h - .008, h, 'ledStrip') }
  }
  planter({ r: [x1, y1, x2, y2], h }) {
    const b = this.b
    b.box(x1, y1, x2, y2, 0, h, 'stone', .01); b.box(x1 + 3, y1 + 3, x2 - 3, y2 - 3, h, h + .005, 'soil')
    const n = Math.round(((x2 - x1) * (y2 - y1)) / 900)
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(.09 + this.rnd() * .08, 1); g.scale(1, .8, 1)
      g.translate(X(x1 + 6 + this.rnd() * (x2 - x1 - 12)), b.base + h + .06, Z(y1 + 6 + this.rnd() * (y2 - y1 - 12))); b.add(g, 'plant')
    }
  }
  opening({ r: [x1, y1, x2, y2], head }) {
    const b = this.b, horiz = (x2 - x1) > (y2 - y1), c = 6
    b.at('arch', b.floor, b.base).box(x1, y1, x2, y2, head, H, 'wall')
    b.at('int', b.floor, b.base)
    if (horiz) { b.box(x1, y1 - 1, x1 + c, y2 + 1, 0, head, 'oak'); b.box(x2 - c, y1 - 1, x2, y2 + 1, 0, head, 'oak'); b.box(x1, y1 - 1, x2, y2 + 1, head, head + .06, 'oak') }
    else { b.box(x1 - 1, y1, x2 + 1, y1 + c, 0, head, 'oak'); b.box(x1 - 1, y2 - c, x2 + 1, y2, 0, head, 'oak'); b.box(x1 - 1, y1, x2 + 1, y2, head, head + .06, 'oak') }
  }
  clerestory({ r: [x1, y1, x2, y2], sill, headFromCeiling }) {
    const b = this.b, head = H - headFromCeiling
    for (const x of [x1, (x1 + x2) / 2, x2 - 5]) b.box(x, y1 + 2, x + 5, y2 - 2, sill, head, 'metal')
    b.box(x1, y1 + 2, x2, y2 - 2, head - .05, head, 'metal'); b.box(x1, y1 + 2, x2, y2 - 2, sill, sill + .04, 'metal')
    const cy = (y1 + y2) / 2; b.box(x1, cy - .6, x2, cy + .6, sill, head, 'glass')
  }
  lights({ p }) {
    for (const [x, y] of p) {
      const g = new THREE.CylinderGeometry(.045, .045, .01, 20); g.translate(X(x), this.b.base + H - .004, Z(y)); this.b.add(g, 'lightDisc')
      this.lightPoints[this.b.floor].push([x, y])
    }
  }
  pendantBar({ r: [x1, y1, x2, y2] }) {
    const b = this.b
    b.box(x1, y1, x2, y2, H - .9, H - .87, 'metal', .003); b.box(x1 + 2, y1 + 2, x2 - 2, y2 - 2, H - .905, H - .9, 'ringLed')
    for (const y of [y1 + 10, y2 - 10]) b.box((x1 + x2) / 2 - .5, y - .5, (x1 + x2) / 2 + .5, y + .5, H - .87, H, 'metal')
  }
  rings({ c: [cx, cy] }) {
    const b = this.b, top = H + STOREY
    ;[[.62, H + .55, 0, 0], [.46, H + 1.05, .35, -.25], [.34, H + .2, -.3, .3]].forEach(([r, y, ox, oz]) => {
      const x = X(cx) + ox, z = Z(cy) + oz
      const ring = new THREE.TorusGeometry(r, .018, 10, 96); ring.rotateX(Math.PI / 2); ring.translate(x, b.base + y, z); b.add(ring, 'metal')
      const led = new THREE.TorusGeometry(r, .008, 6, 96); led.rotateX(Math.PI / 2); led.translate(x, b.base + y - .016, z); b.add(led, 'ringLed')
      for (const a of [0, 2.1, 4.2]) { const c = new THREE.CylinderGeometry(.0015, .0015, top - y, 4); c.translate(x + Math.cos(a) * r, b.base + (top + y) / 2, z + Math.sin(a) * r); b.add(c, 'metal') }
    })
  }
  fireplace({ r: [x1, y1, x2, y2] }) {
    const b = this.b
    b.box(x1, y1, x2, y1 + 24, 0, .40, 'quartz', .005)                       // floating bench
    b.box(x1 + 9, y1 + 24, x2 - 1, y2, 0, .30, 'stone'); b.box(x1 + 9, y1 + 24, x2 - 1, y2, .78, H, 'stone')
    b.box(x1 + 15, y2 - 18, x2 - 7, y2 - 6, .30, .78, 'blackGlass'); b.box(x1 + 15, y1 + 30, x2 - 7, y2 - 6, .30, .33, 'blackGlass')
    b.box(x1 + 21, y1 + 36, x2 - 13, y1 + 44, .33, .37, 'flame')
    this.firePoints.push({ f: b.floor, x: (x1 + x2) / 2 + 9, y: y1 + 40, base: b.base, w: X(x2 - x1 - 34) })
  }
  // U stair between two storeys: 9 floating oak treads up to the landing, 7 more to the next floor.
  // Treads run into the wall (cantilevered); one continuous sloped glass balustrade on each open side.
  stairU() {
    const b = this.b, r = STOREY / 16, T = .045
    for (let i = 0; i < 9; i++) { const y2 = 990 - i * 17.8; b.box(805, y2 - 17.8, 1019, y2 + 1, (i + 1) * r - T, (i + 1) * r, 'oak', .004) }
    b.box(805, 703, 1020, 830, 9 * r - .2, 9 * r, 'oak', .004)
    for (let i = 0; i < 7; i++) { const x2 = 805 - i * 20; b.box(x2 - 20, 704, x2 + 1, 815, 9 * r + (i + 1) * r - T, 9 * r + (i + 1) * r, 'oak', .004) }
    // lower flight, open (west) side: from the first tread up to the landing, then along the landing edge
    this._glassRun([[990, r], [830, 9 * r], [815, 9 * r]], 'y', 803)
    // upper flight, open (south) side, over the planter: landing → top floor
    this._glassRun([[805, 9 * r], [665, 16 * r]], 'x', 816)
  }
  // A sloped glass balustrade 1 m above the tread nosings. pts = [along, height][] along x or y; at = the fixed coordinate.
  _glassRun(pts, axis, at) {
    const b = this.b, HGT = .95, TH = .012
    const pos: number[] = [], idx: number[] = []
    const P = (a, h) => (axis === 'y' ? [X(at), b.base + h, Z(a)] : [X(a), b.base + h, Z(at)])
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, h0] = pts[i], [a1, h1] = pts[i + 1], n = pos.length / 3
      for (const [a, h] of [[a0, h0], [a1, h1], [a1, h1 + HGT], [a0, h0 + HGT]]) pos.push(...P(a, h))
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3, n, n + 2, n + 1, n, n + 3, n + 2)   // both faces
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx)   // normals are computed per face after the batcher de-indexes it
    b.add(g, 'railGlass')
    // slim handrail cap along the top edge
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, h0] = pts[i], [a1, h1] = pts[i + 1], p0 = new THREE.Vector3(...P(a0, h0 + HGT)), p1 = new THREE.Vector3(...P(a1, h1 + HGT))
      const len = p0.distanceTo(p1), cap = new THREE.BoxGeometry(TH * 3, .03, len)
      cap.applyMatrix4(new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 1, 0)))
      cap.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2)
      b.add(cap, 'metal')
    }
  }
  dispose() {}
}
