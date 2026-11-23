import * as THREE from 'three'
import { X, Z, H, LEVEL } from '../units'

/**
 * The cut through the walls, as a plan draws it: seen from above, every wall of the storey on show is capped in
 * near-black (walls, and the wall over each window and door). Shown only in the view from above.
 */
export default class PlanCaps {
  [key: string]: any
  constructor(world) {
    this.scene = world.scene
    this.material = new THREE.MeshBasicMaterial({ color: 0x23262a, side: THREE.DoubleSide })
    const house = world.house
    this.meshes = [0, 1, 2].map(f => {
      const fl = house.floors[f]; if (!fl) return null
      const rects = [...fl.glass.map(g => [g[0], g[1], g[2], g[3]]), ...house.items.filter(i => i.k === 'opening' && i.f === f).map(i => i.r)]
      const polys = [...fl.walls, ...rects.map(r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]])]
      const pos: number[] = [], y = LEVEL[f] + H + .012
      for (const p of polys) {
        if (!p || p.length < 3) continue
        const contour = p.map(q => new THREE.Vector2(q[0], q[1]))
        for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) for (const k of [a, b, c]) pos.push(X(p[k][0]), y, Z(p[k][1]))
      }
      if (!pos.length) return null
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      const mesh = new THREE.Mesh(geo, this.material); mesh.visible = false; mesh.renderOrder = 2
      this.scene.add(mesh)
      return mesh
    })
  }
  /** Show the caps of one storey (-1: none). */
  show(floor: number) { this.meshes.forEach((m, f) => { if (m) m.visible = f === floor }) }
  dispose() { for (const m of this.meshes) if (m) { this.scene.remove(m); m.geometry.dispose() } this.material.dispose() }
}
