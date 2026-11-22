import * as THREE from 'three'
import { X, Z, LEVEL } from '../units'

// 3D furniture from house.json `model` items. Each placement is fitted to its plan footprint (x/z) and height,
// then all placements of the same model on the same storey become ONE InstancedMesh per sub-mesh
// (8 dining chairs = 1 draw call per chair material instead of 8).
export default class Furniture {
  [key: string]: any
  constructor(world, resources) {
    this.meshes = []
    const byKey = new Map()
    for (const it of world.house.items) {
      if (it.k !== 'model') continue
      const k = it.name + '|' + it.f
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
        world.groups.int[+f].add(im)
        this.meshes.push(im)
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
  dispose() { for (const m of this.meshes) { m.removeFromParent(); m.dispose() } this.meshes = [] }  // geometry/material belong to Resources
}
