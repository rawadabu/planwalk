import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Experience from './Experience'
import { X, Z } from './world/units'

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// Perspective camera, the orbit controls used in top view, and eased camera moves between poses.
export default class Camera {
  [key: string]: any
  constructor() {
    this.experience = new Experience()
    const { sizes, scene, canvas } = this.experience
    this.instance = new THREE.PerspectiveCamera(62, sizes.width / sizes.height, 0.05, 300)
    scene.add(this.instance)
    this.orbit = new OrbitControls(this.instance, canvas)
    Object.assign(this.orbit, { enabled: false, enableDamping: true, maxPolarAngle: Math.PI * .47, minDistance: 4, maxDistance: 45 })
    this.orbit.target.set(X(575), 0, Z(840))
    this.tween = null
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  resize() {
    const { width, height } = this.experience.sizes
    this.instance.aspect = width / height
    this.instance.updateProjectionMatrix()
  }
  topPose(floorY) {
    // over the middle of the storey on show, almost straight down (a plan with a little depth), far enough to see all of it
    const exp = this.experience, b = exp.world?.house?.floors?.[exp.state.floor]?.bounds
    if (!b || b[2] - b[0] < 200) { this.orbit.target.set(X(575), floorY, Z(840)); const p0 = new THREE.Vector3(X(575), floorY + 15.5, Z(1720)); return { pos: p0, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p0, this.orbit.target, THREE.Object3D.DEFAULT_UP)) } }
    const cx = X((b[0] + b[2]) / 2), cz = Z((b[1] + b[3]) / 2), w = X(b[2] - b[0]) + 2, d = Z(b[3] - b[1]) + 2
    const t = Math.tan(this.instance.fov * Math.PI / 360), dist = Math.max(d / 2 / t, w / 2 / (t * this.instance.aspect)) * 1.12 + 2.8
    this.orbit.target.set(cx, floorY, cz)
    const pos = new THREE.Vector3(cx, floorY + dist, cz + dist * .16)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, this.orbit.target, THREE.Object3D.DEFAULT_UP))
    return { pos, q }
  }
  // Whole house from the garden (south-west, above the hedge)
  outsidePose() {
    this.orbit.target.set(X(575), 2.2, Z(840))
    const pos = new THREE.Vector3(X(575) - 15, 8.5, Z(840) + 19)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, this.orbit.target, THREE.Object3D.DEFAULT_UP))
    return { pos, q }
  }
  // Ease from the current pose to `to` ({ pos, q } or a function returning one, re-evaluated every frame).
  tweenTo(to, duration, done) {
    this.tween = { from: { pos: this.instance.position.clone(), q: this.instance.quaternion.clone() }, to, t: 0, duration: this.reduceMotion ? 0.01 : duration, done }
  }
  update(dt) {
    if (this.tween) {
      const tw = this.tween
      tw.t += dt / tw.duration
      const k = ease(Math.min(1, tw.t)), to = typeof tw.to === 'function' ? tw.to() : tw.to
      this.instance.position.lerpVectors(tw.from.pos, to.pos, k)
      this.instance.quaternion.slerpQuaternions(tw.from.q, to.q, k)
      if (tw.t >= 1) { this.tween = null; tw.done?.() }
    } else if (this.orbit.enabled) this.orbit.update()
  }
  dispose() { this.orbit.dispose(); this.experience.scene.remove(this.instance) }
}
