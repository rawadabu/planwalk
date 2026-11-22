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
    Object.assign(this.orbit, { enabled: false, enableDamping: true, maxPolarAngle: Math.PI * .47, minDistance: 4, maxDistance: 32 })
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
    this.orbit.target.set(X(575), floorY, Z(840))
    const pos = new THREE.Vector3(X(575), floorY + 15.5, Z(1720))
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
