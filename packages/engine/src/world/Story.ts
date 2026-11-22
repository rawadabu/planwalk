import * as THREE from 'three'
import Experience from '../Experience'
import { X, Z, H, LEVEL } from './units'
import type { StoreyId } from '@planwalk/house'

/**
 * Scroll story: the house builds itself from its own plan data, Israeli-style.
 *   0 blueprint lines → 1 foundation → 2 concrete frame (columns + slabs) → 3 block walls → 4 windows → 5 finish
 * then the camera walks into the kitchen, where finishes can be swapped live (setFinish).
 * Each stage reveals its meshes with a rising clipping plane, so nothing is rebuilt per frame.
 * t ∈ [0, 1] comes from the page scroll; the displayed value eases toward it.
 */
export const STAGES = 6
export const EXTERIOR_END = 0.84          // t where the exterior build ends and the camera goes inside
const TOP = LEVEL[2] + H + 0.35           // roof top
const BOTTOM = LEVEL[0] - 0.3

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export default class Story {
  [key: string]: any
  constructor() {
    this.experience = new Experience()
    this.active = false
    this.target = 0
    this.t = 0
    this.built = false
    this.planes = { lines: new THREE.Plane(new THREE.Vector3(0, -1, 0), BOTTOM), slab: new THREE.Plane(new THREE.Vector3(0, -1, 0), BOTTOM),
      frame: new THREE.Plane(new THREE.Vector3(0, -1, 0), BOTTOM), walls: new THREE.Plane(new THREE.Vector3(0, -1, 0), BOTTOM), glass: new THREE.Plane(new THREE.Vector3(0, -1, 0), BOTTOM) }
  }

  // ---------- one-time geometry: blueprint lines, concrete columns, raw block material ----------
  _build() {
    const exp = this.experience, world = exp.world, house = world.house
    this.group = new THREE.Group(); this.group.name = 'story'; exp.scene.add(this.group)

    const linePos: number[] = [], cols: Array<[number, number, StoreyId]> = []
    for (const f of [0, 1, 2] as StoreyId[]) {
      const y0 = LEVEL[f], y1 = LEVEL[f] + H
      for (const p of house.floors[f].walls) {
        for (let i = 0; i < p.length; i++) {
          const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length], [cx, cy] = p[(i + 2) % p.length]
          for (const y of [y0, y1]) linePos.push(X(ax), y, Z(ay), X(bx), y, Z(by))
          linePos.push(X(bx), y0, Z(by), X(bx), y1, Z(by))
          // a column where two long wall faces meet
          const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by)
          if (l1 > 45 && l2 > 45 && !cols.some(([x, y, ff]) => ff === f && Math.hypot(x - bx, y - by) < 70)) cols.push([bx, by, f])
        }
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [this.planes.lines] })
    this.lines = new THREE.LineSegments(lg, this.lineMat); this.lines.frustumCulled = false; this.group.add(this.lines)

    this.concrete = new THREE.MeshStandardMaterial({ color: 0xa7a49e, roughness: .92, clippingPlanes: [this.planes.frame] })
    const cg = new THREE.BoxGeometry(.25, H, .25)
    this.columns = new THREE.InstancedMesh(cg, this.concrete, cols.length)
    const m = new THREE.Matrix4()
    cols.forEach(([x, y, f], i) => this.columns.setMatrixAt(i, m.makeTranslation(X(x), LEVEL[f] + H / 2, Z(y))))
    this.columns.castShadow = this.columns.receiveShadow = true
    this.group.add(this.columns)

    // raw concrete-block walls (40 × 20 cm blocks) until the plaster goes on
    const blocks = world.materials.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#b9b4ab'; g.fillRect(0, 0, w, h)
      const bw = w / 5, bh = h / 10
      for (let r = 0; r < 10; r++) for (let c = -1; c < 6; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, v = 168 + ((r * 7 + c * 13) % 5) * 6
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4)
      }
    }, true)
    this.rawWall = new THREE.MeshStandardMaterial({ map: blocks, roughness: 1, clippingPlanes: [this.planes.walls] })

    // sort the house's static meshes into stages by material
    const SLAB = new Set(['floor', 'ceil', 'deck', 'paver'])
    this.sets = { slab: [] as THREE.Mesh[], walls: [] as THREE.Mesh[], glass: [] as THREE.Mesh[] }
    for (const g of world.groups.arch) g.traverse((o: any) => {
      if (!o.isMesh) return
      const k = o.userData.matKey
      ;(k === 'wall' ? this.sets.walls : SLAB.has(k) ? this.sets.slab : this.sets.glass).push(o)
    })
    this.built = true
  }

  // ---------- enter / leave ----------
  enter() {
    const exp = this.experience
    if (!exp.world.ready || this.active) return
    if (!this.built) this._build()
    this.active = true
    exp.camera.orbit.enabled = false; exp.camera.tween = null
    exp.renderer.instance.localClippingEnabled = true
    // clipping planes straight on the shared stage materials (one recompile each, then only plane constants move)
    this._clipped = new Map<THREE.Material, THREE.Plane[] | null>()
    const clip = (list: THREE.Mesh[], plane: THREE.Plane) => list.forEach(m => {
      const mat = m.material as THREE.Material
      if (!this._clipped.has(mat)) { this._clipped.set(mat, mat.clippingPlanes); mat.clippingPlanes = [plane]; mat.needsUpdate = true }
    })
    clip(this.sets.slab, this.planes.slab); clip(this.sets.glass, this.planes.glass); clip(this.sets.walls, this.planes.walls)
    this.wallMat = this.sets.walls[0]?.material
    this.group.visible = true
    exp.setMode('story')
    this.apply(this.t, true)
  }
  exit() {
    const exp = this.experience
    if (!this.active) return
    this.active = false
    for (const [mat, planes] of this._clipped) { mat.clippingPlanes = planes; mat.needsUpdate = true }
    this.sets.walls.forEach(m => { m.material = this.wallMat })
    this.group.visible = false
    exp.renderer.instance.localClippingEnabled = false
    this._base = null
    exp.world.environment.setTime(exp.state.time === 'custom' ? 'golden' : exp.state.time)
    exp.world.groups.roof.visible = true
    exp.setMode('walk')
    exp.player.setFloor(1, exp.world.house.floors[1].start)
    exp.renderer.requestShadowUpdate()
  }
  set(t: number) { this.target = Math.max(0, Math.min(1, t)) }

  update(dt: number) {
    if (!this.active) return
    const d = this.target - this.t
    this.t += Math.abs(d) < 1e-4 ? d : d * Math.min(1, dt * 5)
    this.apply(this.t)
  }

  // ---------- the stages ----------
  apply(t: number, force = false) {
    const exp = this.experience, world = exp.world, P = this.planes
    const s = Math.min(1, t / EXTERIOR_END) * STAGES                 // 0…6 across the exterior part
    const u = (i: number) => Math.max(0, Math.min(1, s - i))         // progress of stage i
    const rise = (k: number) => BOTTOM + (TOP - BOTTOM) * k
    P.lines.constant = rise(smooth(0, 1, u(0)))
    this.lineMat.opacity = .95 * (1 - smooth(.2, 1, u(3)))
    P.slab.constant = u(1) < 1 ? LEVEL[0] + .05 + (u(1) > .05 ? 0 : -1) : rise(smooth(0, 1, u(2)))   // ground slab, then the floors with the frame
    P.frame.constant = rise(smooth(0, 1, u(2)))
    P.walls.constant = rise(smooth(0, 1, u(3)))
    P.glass.constant = rise(smooth(0, 1, u(4)))
    this.columns.visible = u(2) > 0 && u(5) < .4
    this.lines.visible = this.lineMat.opacity > .01
    world.groups.roof.visible = u(3) > .9
    // finish: plaster instead of blocks, then the furniture and lights inside
    const finished = u(5) > .08
    if (finished !== this._finished || force) {
      this._finished = finished
      this.sets.walls.forEach(m => { m.material = finished ? this.wallMat : this.rawWall })
    }
    const inside = t > EXTERIOR_END + .03
    world.groups.int.forEach((g, i) => { g.visible = inside ? i >= 1 : finished && i >= 1 })
    world.groups.arch.forEach(g => { g.visible = true })
    // shadows follow the build, but not every frame
    const stage = Math.floor(s * 4) + (inside ? 100 : 0)
    if (stage !== this._stage) { this._stage = stage; exp.renderer.requestShadowUpdate() }
    // light: blue dusk while it is only lines and concrete, warming into the chosen time of day as it finishes
    const day = smooth(2.2, 5.2, s) * (1 - 0) + (inside ? 1 : 0)
    const k = Math.min(1, day)
    const env = world.environment, base = this._base || (this._base = { exp: exp.renderer.instance.toneMappingExposure, bg: exp.scene.backgroundIntensity, sun: env.sun.intensity, hemi: env.hemi.intensity, env: exp.scene.environmentIntensity })
    exp.renderer.instance.toneMappingExposure = base.exp * (.55 + .45 * k)
    exp.scene.backgroundIntensity = base.bg * (.12 + .88 * k)
    exp.scene.environmentIntensity = base.env * (.5 + .5 * k)
    env.sun.intensity = base.sun * (.08 + .92 * k)
    env.hemi.intensity = base.hemi * (.6 + .4 * k)
    this.lineMat.color.setHex(0x6fd3ff)
    this._camera(t)
  }

  // ---------- camera: a slow arc around the site, then into the kitchen ----------
  _camera(t: number) {
    const cam = this.experience.camera.instance
    const c = new THREE.Vector3(X(575), 0, Z(840))
    const ext = Math.min(1, t / EXTERIOR_END)
    // portrait phones: further back, and the house sits in the upper half above the captions
    const sz = this.experience.sizes, aspect = sz.width / sz.height, far = aspect < 1 ? Math.pow(Math.min(2.2, 1 / aspect), .8) : 1
    const az = -0.75 + ext * 1.35, dist = (23.5 - ext * 3) * far, h = (12.5 - ext * 7.5) * far
    const outPos = new THREE.Vector3(c.x + Math.sin(az) * dist, h, c.z + Math.cos(az) * dist)
    // aim a little to the right of the house, so it sits in the left part of the screen beside the captions
    const fwd = new THREE.Vector3(c.x - outPos.x, 0, c.z - outPos.z).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    const side = this.experience.sizes.width > 820 ? dist * .27 : 0
    const outLook = new THREE.Vector3(c.x, -.8 + ext * 2.6 - (aspect < 1 ? 4.5 : 0), c.z).addScaledVector(right, side)
    // inside: kitchen on the first floor, looking past the island to the tall cabinets
    const inPos = new THREE.Vector3(X(560), 1.55, Z(655)), inLook = new THREE.Vector3(X(250), 1.05, Z(400))
    const k = smooth(EXTERIOR_END + .01, EXTERIOR_END + .05, t)
    if (k <= 0) { cam.position.copy(outPos); cam.lookAt(outLook) }
    else if (k >= 1) { cam.position.copy(inPos); cam.lookAt(inLook.clone().add(new THREE.Vector3(Math.sin((t - .9) * 6) * .6, 0, 0))) }
    else { cam.position.copy(inPos); cam.lookAt(inLook) }      // the page fades through white for this cut
  }

  dispose() {
    if (this.active) this.exit()
    if (!this.built) return
    this.group.removeFromParent(); this.lines.geometry.dispose(); this.lineMat.dispose()
    this.columns.geometry.dispose(); this.columns.dispose(); this.concrete.dispose(); this.rawWall.dispose()
  }
}
