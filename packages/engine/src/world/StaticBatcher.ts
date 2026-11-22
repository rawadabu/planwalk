import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { X, Z } from './units'

// Collects static geometry and merges it into ONE mesh per (layer, storey, material) → a handful of draw calls for
// thousands of boxes. UVs are box-projected in metres so textures keep real-world scale on every piece.
export default class StaticBatcher {
  [key: string]: any
  constructor(materials, groups) {
    this.materials = materials
    this.groups = groups              // { arch: [g0,g1,g2], int: [g0,g1,g2], outdoor, roof }
    this.batches = new Map()
    this.layer = 'arch'; this.floor = 1; this.base = 0
    this.meshes = []
  }
  // Target for following calls: layer ('arch' | 'int' | 'outdoor' | 'roof'), storey, and the storey's floor level.
  at(layer, floor, base) { this.layer = layer; this.floor = floor; this.base = base; return this }

  _uv(geo, size, rotate) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
      let u, v
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i) } else if (ay >= az) { u = p.getX(i); v = p.getZ(i) } else { u = p.getX(i); v = p.getY(i) }
      if (rotate) [u, v] = [v, u]
      uv[i * 2] = u / size; uv[i * 2 + 1] = v / size
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }
  add(geo, key, opts: any = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    g.clearGroups()
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a)
    if (!g.attributes.normal) g.computeVertexNormals()
    this._uv(g, opts.uv || this.materials.uvSize[key] || 1, opts.rot)
    const id = `${this.layer}|${this.floor}|${key}`
    if (!this.batches.has(id)) this.batches.set(id, [])
    this.batches.get(id).push(g)
  }
  // Box in metres (centre x/z, bottom y relative to the storey base).
  boxM(cx, y0, cz, w, h, d, key, r = 0, opts) {
    if (w <= 0 || h <= 0 || d <= 0) return
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
    const g = rr > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d)
    g.translate(cx, this.base + y0 + h / 2, cz)
    this.add(g, key, opts)
  }
  // Box from a plan rectangle (px) and heights in metres above the storey floor.
  box(x1, y1, x2, y2, y0, y1h, key, r = 0, opts) {
    this.boxM(X((x1 + x2) / 2), y0, Z((y1 + y2) / 2), X(x2 - x1), y1h - y0, Z(y2 - y1), key, r, opts)
  }
  // Extrude closed plan polygons (px) upward from y0 by h (metres, relative to the storey base).
  extrude(polys, y0, h, key, holes: any[] = []) {
    for (const p of polys) {
      const sh = new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(X(x), Z(y))))
      for (const hole of holes) sh.holes.push(new THREE.Path([...hole].reverse().map(([x, y]) => new THREE.Vector2(X(x), Z(y)))))
      const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false })
      g.rotateX(Math.PI / 2); g.translate(0, this.base + y0 + h, 0)
      this.add(g, key)
    }
  }
  flush() {
    for (const [id, list] of this.batches) {
      const [layer, f, key] = id.split('|')
      const geo = mergeGeometries(list, false); list.forEach(g => g.dispose())
      const mesh = new THREE.Mesh(geo, this.materials.get(key))
      mesh.name = id
      mesh.userData.matKey = key
      mesh.castShadow = !this.materials.shadowless.has(key)
      mesh.receiveShadow = !['lightDisc', 'flame', 'ledStrip', 'ringLed'].includes(key)
      mesh.matrixAutoUpdate = false; mesh.updateMatrix()
      const g = Array.isArray(this.groups[layer]) ? this.groups[layer][+f] : this.groups[layer]
      g.add(mesh); this.meshes.push(mesh)
    }
    this.batches.clear()
  }
  dispose() { for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent() } this.meshes = [] }
}
