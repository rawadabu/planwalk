import * as THREE from 'three'
import { X, Z, H, LEVEL, STOREY } from '../units'

// Room-level finishes and selection highlights. The house itself is batched per storey (fast, but one mesh for
// all rooms), so a room's own floor / walls / ceiling are drawn as thin "skins" laid over the base surfaces:
//   floor   a plane 1.4 mm above the floor finish, over the room's rectangle
//   ceiling a plane 4 mm under the ceiling
//   walls   a quad 3 mm in front of every wall face that borders the room (clipped to the room)
// Skins are built on demand and cached; UVs match the batcher's, so textures line up with the base surfaces.
const BASE_KEY = { floor: 'floor', walls: 'wall', ceiling: 'ceil' }
export type SkinPart = keyof typeof BASE_KEY

export default class RoomSkins {
  [key: string]: any
  constructor(world) {
    this.world = world
    this.geos = new Map<string, THREE.BufferGeometry>()      // part|f|room → geometry
    this.skins = new Map<string, THREE.Mesh>()               // part|f|room → mesh showing a finish
    this.hl = new THREE.MeshBasicMaterial({ color: 0x2f6fed, transparent: true, opacity: .28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    this.hlMesh = null
  }

  /** Room rectangle, clipped to the storey's indoor area. */
  rect(f, room) {
    const r = this.world.house.floors[f].rooms[room]
    return [Math.max(r[2], 105), Math.max(r[3], 105), Math.min(r[4], 1040), Math.min(r[5], 1460)]
  }

  geometry(part: SkinPart, f, room) {
    const key = `${part}|${f}|${room}`
    if (this.geos.has(key)) return this.geos.get(key)
    const [x1, y1, x2, y2] = this.rect(f, room), base = LEVEL[f]
    let g
    if (part === 'floor' || part === 'ceiling') {
      g = new THREE.PlaneGeometry(X(x2 - x1), Z(y2 - y1))
      g.rotateX(part === 'floor' ? -Math.PI / 2 : Math.PI / 2)
      g.translate(X((x1 + x2) / 2), base + (part === 'floor' ? .0135 : H - .004), Z((y1 + y2) / 2))
    } else {
      g = this.wallGeometry(f, [x1, y1, x2, y2])
    }
    this.world.batcher._uv(g, this.world.materials.uvSize[BASE_KEY[part]] || 1)
    this.geos.set(key, g)
    return g
  }

  // Quads in front of each axis-aligned wall face that faces into the room rectangle.
  wallGeometry(f, [x1, y1, x2, y2]) {
    const fl = this.world.house.floors[f], base = LEVEL[f], OFF = .3, pos: number[] = [], nor: number[] = []
    const inR = (x, y) => x > x1 && x < x2 && y > y1 && y < y2
    const quad = (ax, ay, bx, by, nx, ny) => {
      // corners in plan px → metres; nudged 3 mm (0.3 px) off the wall along its normal
      // under the double-height void the wall runs up through the next storey
      const mx = (ax + bx) / 2 + nx * 6, my = (ay + by) / 2 + ny * 6
      const tall = f === 1 && this.world.house.void && this.solid(this.world.house.void, mx, my)
      const a = [X(ax + nx * OFF), Z(ay + ny * OFF)], b = [X(bx + nx * OFF), Z(by + ny * OFF)], lo = base + .08, hi = base + (tall ? STOREY + H : H)
      const v = [a[0], lo, a[1], b[0], lo, b[1], b[0], hi, b[1], a[0], lo, a[1], b[0], hi, b[1], a[0], hi, a[1]]
      // wind so the face points into the room
      const flip = (b[0] - a[0]) * ny - (b[1] - a[1]) * nx <= 0
      if (flip) { pos.push(...v.slice(0, 3), ...v.slice(6, 9), ...v.slice(3, 6), ...v.slice(9, 12), ...v.slice(15, 18), ...v.slice(12, 15)) } else pos.push(...v)
      for (let i = 0; i < 6; i++) nor.push(nx, 0, ny)
    }
    for (const p of fl.walls) for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length]
      if (Math.abs(ay - by) < .5) {                 // horizontal face: room above or below it
        const lo = Math.max(Math.min(ax, bx), x1), hi = Math.min(Math.max(ax, bx), x2)
        if (hi - lo < 4) continue
        const m = (lo + hi) / 2
        if (inR(m, ay + 4) && !this.solid(p, m, ay + 4)) quad(lo, ay, hi, ay, 0, 1)
        else if (inR(m, ay - 4) && !this.solid(p, m, ay - 4)) quad(lo, ay, hi, ay, 0, -1)
      } else if (Math.abs(ax - bx) < .5) {          // vertical face
        const lo = Math.max(Math.min(ay, by), y1), hi = Math.min(Math.max(ay, by), y2)
        if (hi - lo < 4) continue
        const m = (lo + hi) / 2
        if (inR(ax + 4, m) && !this.solid(p, ax + 4, m)) quad(ax, lo, ax, hi, 1, 0)
        else if (inR(ax - 4, m) && !this.solid(p, ax - 4, m)) quad(ax, lo, ax, hi, -1, 0)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    return g
  }
  // a point inside the wall polygon itself is wall, not room
  solid(p, x, y) {
    let c = false
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c }
    return c
  }

  /** Show exactly these room finishes: [{ part, floor, room, look }]. */
  apply(list) {
    const want = new Set<string>()
    for (const { part, floor: f, room, look } of list) {
      if (!BASE_KEY[part] || room >= this.world.house.floors[f].indoor) continue
      const key = `${part}|${f}|${room}`
      want.add(key)
      let m = this.skins.get(key)
      if (!m) {
        m = new THREE.Mesh(this.geometry(part, f, room))
        m.receiveShadow = true
        m.userData = { matKey: BASE_KEY[part], room, skin: true }
        this.world.groups.arch[f].add(m); this.skins.set(key, m)
      }
      m.material = this.world.materials.lookMaterial(BASE_KEY[part], look)
    }
    for (const [key, m] of this.skins) if (!want.has(key)) { m.removeFromParent(); this.skins.delete(key) }
  }

  /** Blue wash over a room surface (or nothing). */
  highlight(sel) {
    if (this.hlMesh) { this.hlMesh.removeFromParent(); this.hlMesh = null }
    if (!sel || sel.room == null || !BASE_KEY[sel.part]) return
    const g = this.geometry(sel.part, sel.floor, sel.room)
    this.hlMesh = new THREE.Mesh(g, this.hl); this.hlMesh.renderOrder = 5; this.hlMesh.userData.noPick = true
    this.world.groups.arch[sel.floor].add(this.hlMesh)
  }

  dispose() {
    for (const m of this.skins.values()) m.removeFromParent()
    this.hlMesh?.removeFromParent()
    for (const g of this.geos.values()) g.dispose()
    this.hl.dispose(); this.skins.clear(); this.geos.clear()
  }
}
