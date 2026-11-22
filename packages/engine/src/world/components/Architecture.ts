import * as THREE from 'three'
import { X, Z, H, LEVEL, STOREY } from '../units'

// Structure of every storey from house.json: extruded wall polygons, baseboards, glazing (frames, sills, mullions,
// panes), the slab between floors 1 and 2 with the double-height void cut out, the top-floor finish and the roof.
export default class Architecture {
  [key: string]: any
  constructor(world) {
    this.world = world
    const b = world.batcher, house = world.house
    for (const f of [0, 1, 2]) {
      const fl = house.floors[f], base = LEVEL[f]
      b.at('arch', f, base)
      const tall = fl.walls.filter(p => !(f === 0 && Math.min(...p.map(q => q[1])) >= 1560))
      const low = fl.walls.filter(p => f === 0 && Math.min(...p.map(q => q[1])) >= 1560)
      b.extrude(tall, 0, H, 'wall')
      b.extrude(low, 0, 1.1, 'wall')               // garden walls along the path
      this._baseboards(b.at('int', f, base), tall, (x, y) => world.inRoom(f, x, y))
      this._glazing(b.at('arch', f, base), fl.glass)
    }
    // slab between floors 1 and 2 (open over the void) and the walkable finish on top of it
    b.at('arch', 2, LEVEL[2])
    b.extrude([[[109, 108], [1040, 108], [1040, 1456], [109, 1456]]], -0.25, 0.25, 'ceil', [house.void])
    b.extrude([[[105, 105], [1040, 105], [1040, 1512], [105, 1512]]], 0, 0.012, 'floor', [house.void])
    // roof over the top floor
    b.at('roof', 2, LEVEL[2]).box(105, 102, 1045, 1612, H, H + 0.3, 'ceil')
  }
  _baseboards(b, polys, inside) {
    for (const p of polys) for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length], len = Math.hypot(bx - ax, by - ay)
      if (len < 4) continue
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      if (!inside(mx + 3, my) && !inside(mx - 3, my) && !inside(mx, my + 3) && !inside(mx, my - 3)) continue
      const horiz = Math.abs(by - ay) < 1e-3
      b.boxM(X(mx), 0, Z(my), horiz ? X(len) : .024, .08, horiz ? .024 : Z(len), 'lacquer')
    }
  }
  _glazing(b, list) {
    for (const [x1, y1, x2, y2, sill, head] of list) {
      const horiz = (x2 - x1) > (y2 - y1)
      if (sill > 0) b.box(x1, y1, x2, y2, 0, sill, 'wall')
      b.box(x1, y1, x2, y2, head, H, 'wall')
      b.box(...(horiz ? [x1, y1 - 3, x2, y2 + 3] : [x1 - 3, y1, x2 + 3, y2]), sill - .02, sill + (sill > 0 ? .03 : .01), 'quartz')
      if (horiz) { b.box(x1, y1, x1 + 5, y2, sill, head, 'metal'); b.box(x2 - 5, y1, x2, y2, sill, head, 'metal') }
      else { b.box(x1, y1, x2, y1 + 5, sill, head, 'metal'); b.box(x1, y2 - 5, x2, y2, sill, head, 'metal') }
      b.box(x1, y1, x2, y2, head - .05, head, 'metal')
      const n = Math.max(1, Math.round((horiz ? x2 - x1 : y2 - y1) / 120))
      for (let i = 1; i < n; i++) {
        const t = x1 + (x2 - x1) * i / n, u = y1 + (y2 - y1) * i / n
        horiz ? b.box(t - 2.5, y1, t + 2.5, y2, sill, head, 'metal') : b.box(x1, u - 2.5, x2, u + 2.5, sill, head, 'metal')
      }
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, th = .012
      horiz ? b.box(x1, cy - th / 2 / (4.4 / 437), x2, cy + th / 2 / (4.4 / 437), sill, head - .05, 'glass')
            : b.box(cx - th / 2 / (4.4 / 437), y1, cx + th / 2 / (4.4 / 437), y2, sill, head - .05, 'glass')
    }
  }
  dispose() {}
}
