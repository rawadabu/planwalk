import * as THREE from 'three'
import Experience from '../Experience'
import { LEVEL } from '../world/units'
import type { MeasureReading } from '../types'

// Tape measure: while active, two taps on the floor give the distance in centimetres.
// The engine draws the dots and line; the UI draws the label from the 'measure' event (screen position + cm).
export default class Measure {
  [key: string]: any
  constructor() {
    this.experience = new Experience()
    const exp = this.experience
    this.active = false
    this.points = [] as THREE.Vector3[]
    this.group = new THREE.Group(); exp.scene.add(this.group)
    this.dotGeo = new THREE.SphereGeometry(.035, 16, 12)
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0xe5483b, depthTest: false })
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xe5483b, depthTest: false })
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this._tap = (e: { clientX: number; clientY: number }) => { if (this.active) this.click(e) }
    exp.on('tap', this._tap)
  }
  setActive(on: boolean) {
    this.active = on
    this.experience.canvas.style.cursor = on ? 'crosshair' : ''
    if (!on) this.clear()
  }
  clear() {
    this.points.length = 0
    for (const o of [...this.group.children]) { if ((o as THREE.Line).isLine) (o as THREE.Line).geometry.dispose(); this.group.remove(o) }
    this.experience.trigger('measure', null)
  }
  click(e: { clientX: number; clientY: number }) {
    const exp = this.experience, cam = exp.camera.instance, r = exp.canvas.getBoundingClientRect()
    this.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1)
    cam.updateMatrixWorld(); this.ray.setFromCamera(this.ndc, cam)
    this.plane.constant = -(LEVEL[exp.state.floor] + .01)
    const hit = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, hit)) return
    if (this.points.length === 2) this.clear()
    this.points.push(hit)
    const dot = new THREE.Mesh(this.dotGeo, this.dotMat); dot.position.copy(hit); dot.renderOrder = 10; this.group.add(dot)
    if (this.points.length === 2) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.points), this.lineMat); line.renderOrder = 10; this.group.add(line)
    }
  }
  update() {
    if (this.points.length < 2) return
    const exp = this.experience, r = exp.canvas.getBoundingClientRect()
    const m = this.points[0].clone().add(this.points[1]).multiplyScalar(.5).project(exp.camera.instance)
    const reading: MeasureReading = { cm: Math.round(this.points[0].distanceTo(this.points[1]) * 100), screen: { x: (m.x + 1) / 2 * r.width, y: (1 - m.y) / 2 * r.height }, visible: m.z <= 1 }
    exp.trigger('measure', reading)
  }
  dispose() {
    this.experience.off('tap', this._tap)
    this.clear(); this.experience.scene.remove(this.group); this.dotGeo.dispose(); this.dotMat.dispose(); this.lineMat.dispose()
  }
}
