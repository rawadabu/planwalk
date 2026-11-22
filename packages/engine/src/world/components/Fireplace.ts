import * as THREE from 'three'
import { X, Z } from '../units'

// Gas fire: additive flame sheets + one flickering point light. update() animates the light.
export default class Fireplace {
  [key: string]: any
  constructor(world, points, materials) {
    const tex = materials.canvasTex(128, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h * .95, 4, w / 2, h * .75, h * .7)
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(.25, 'rgba(255,170,70,.85)'); gr.addColorStop(.6, 'rgba(255,90,20,.25)'); gr.addColorStop(1, 'rgba(255,60,0,0)')
      g.fillStyle = gr; g.fillRect(0, 0, w, h)
    }, true)
    this.material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    this.geometry = new THREE.PlaneGeometry(.34, 1)
    this.lights = []
    for (const p of points) {
      const n = 7
      const flames = new THREE.InstancedMesh(this.geometry, this.material, n)     // 7 flames → 1 draw call
      const m = new THREE.Matrix4()
      for (let i = 0; i < n; i++) { const h = .2 + ((i * 37) % 10) / 80; m.compose(new THREE.Vector3(X(p.x) - p.w / 2 + p.w * (i + .5) / n, p.base + .37 + h / 2, Z(p.y)), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); flames.setMatrixAt(i, m) }
      flames.frustumCulled = false
      const light = new THREE.PointLight(0xff8a3a, 1.2, 4, 2); light.position.set(X(p.x), p.base + .55, Z(p.y) - .2)
      const holder = world.groups.int[p.f]; holder.add(flames, light)
      this.lights.push(light)
      this._owned = (this._owned || []).concat(flames, light)
    }
  }
  update(t) { for (const l of this.lights) l.intensity = 1.1 + Math.sin(t * 11) * .12 + Math.sin(t * 23) * .08 }
  dispose() { this._owned?.forEach(o => { o.removeFromParent(); o.dispose?.() }); this.geometry.dispose(); this.material.dispose() }
}
