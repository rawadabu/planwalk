import * as THREE from 'three'
import { X, Z, LEVEL } from '../units'

// 3D furniture from house.json `model` items. Each placement is fitted to its plan footprint (x/z) and height,
// then all placements of the same model on the same storey become ONE InstancedMesh per sub-mesh
// (8 dining chairs = 1 draw call per chair material instead of 8).
// Pieces can be picked, moved live while dragged (one instance matrix per sub-mesh) and outlined when selected.
export default class Furniture {
  [key: string]: any
  constructor(world, resources) {
    this.meshes = []
    this.where = new Map()                              // item → [{ im, i, part, parts }]
    this.world = world
    const byKey = new Map()
    // the house's own furniture, and the neighbourhood's models (houses, trees, cars) which live outdoors
    for (const it of [...world.house.items, ...(world.neighbourhood?.models ?? [])]) {
      if (it.k !== 'model') continue
      const k = it.name + '|' + (it.outdoor || it.layer === 'outdoor' ? 'out' : it.f)
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(it)
    }
    for (const [key, list] of byKey) {
      const [name, f] = key.split('|')
      const src = resources.items[name]
      if (!src) { console.warn('missing model', name); continue }
      src.updateMatrixWorld(true)
      const parts: any[] = []
      src.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); parts.push(o) } })
      const matrices = list.map(it => this._fit(parts, it))
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, matrices.length)
        matrices.forEach((M, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(M, part.matrixWorld)))
        im.instanceMatrix.needsUpdate = true
        im.castShadow = im.receiveShadow = true
        im.computeBoundingSphere()
        im.name = 'model:' + name
        im.userData.items = list
        if (f === 'out') world.groups.outdoor.add(im); else world.groups.int[+f].add(im)
        this.meshes.push(im)
        list.forEach((it, i) => { if (!this.where.has(it)) this.where.set(it, []); this.where.get(it).push({ im, i, part, parts }) })
      }
    }
  }
  // Same fit as the plan builder: rotate to face `rot`, scale to the footprint (or uniformly), sit on the floor.
  _fit(parts, it) {
    const R = new THREE.Matrix4().makeRotationY(it.rot)
    const box = new THREE.Box3(), tmp = new THREE.Box3(), M = new THREE.Matrix4()
    for (const p of parts) { tmp.copy(p.geometry.boundingBox).applyMatrix4(M.multiplyMatrices(R, p.matrixWorld)); box.union(tmp) }
    const size = box.getSize(new THREE.Vector3())
    const [x1, y1, x2, y2] = it.r
    let sx = X(x2 - x1) / size.x, sz = Z(y2 - y1) / size.z, sy = it.h / size.y
    if (it.uniform) sx = sz = sy = Math.min(sx, sz, sy)
    const S = new THREE.Matrix4().makeScale(sx, sy, sz)
    const SR = new THREE.Matrix4().multiplyMatrices(S, R)
    const b2 = new THREE.Box3(); for (const p of parts) { tmp.copy(p.geometry.boundingBox).applyMatrix4(M.multiplyMatrices(SR, p.matrixWorld)); b2.union(tmp) }
    const c = b2.getCenter(new THREE.Vector3())
    const T = new THREE.Matrix4().makeTranslation(X((x1 + x2) / 2) - c.x, LEVEL[it.f] + (it.y || 0) - b2.min.y, Z((y1 + y2) / 2) - c.z)
    return new THREE.Matrix4().multiplyMatrices(T, SR)
  }

  /** The piece under a ray (only pieces whose storey is drawn), nearest first. */
  pick(ray) {
    const targets = this.meshes.filter(m => m.parent?.visible)
    for (const h of ray.intersectObjects(targets, false)) {
      const it = h.object.userData.items?.[h.instanceId]
      if (it) return { item: it, distance: h.distance }
    }
    return null
  }
  /** A piece moved (its `r` / `rot` changed): redraw just that one. */
  update(it) {
    for (const { im, i, part, parts } of this.where.get(it) ?? []) {
      im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(this._fit(parts, it), part.matrixWorld))
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
    if (this.selected === it) this.select(it)
  }
  /** Outline the chosen piece (null clears). */
  select(it) {
    this.selected = it
    if (!it) { if (this.marker) this.marker.visible = false; return }
    if (!this.marker) {
      this.marker = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x2f6fed, depthTest: false, transparent: true }))
      this.marker.renderOrder = 999; this.marker.userData.noPick = true; this.marker.frustumCulled = false
      this.world.scene.add(this.marker)
    }
    const [x1, y1, x2, y2] = it.r, pad = .04, h = Math.max(it.h, .1)
    this.marker.scale.set(X(x2 - x1) + pad, h + pad, Z(y2 - y1) + pad)
    this.marker.position.set(X((x1 + x2) / 2), LEVEL[it.f] + (it.y || 0) + h / 2, Z((y1 + y2) / 2))
    this.marker.updateMatrix(); this.marker.updateMatrixWorld(true)
    this.marker.visible = true
  }
  dispose() {
    for (const m of this.meshes) { m.removeFromParent(); m.dispose() }   // geometry/material belong to Resources
    this.meshes = []; this.where.clear()
    if (this.marker) { this.marker.removeFromParent(); this.marker.geometry.dispose(); this.marker.material.dispose(); this.marker = null }
    this.selected = null
  }
}
