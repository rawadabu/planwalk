import * as THREE from 'three'
import Experience from '../Experience'
import { K, LEVEL } from '../world/units'

/**
 * Arranging furniture: while on, pressing a piece selects it and dragging slides it over its floor (5 cm steps).
 * The look-around / orbit drag is suppressed only for presses that land on a movable piece. The engine moves the
 * piece live; what the move *means* (a design edit) is decided by the app from the 'itemMoved' event.
 */
export default class Arrange {
  [key: string]: any
  constructor() {
    const exp = this.experience = new Experience(), canvas = exp.canvas
    this.active = false
    this.fixed = new Set<string>()
    this.drag = null
    this._pd = (e: PointerEvent) => {
      if (!this.active || !exp.world.ready || e.button > 0 || exp.state.mode === 'story') return
      const item = this.pick(e.clientX, e.clientY); if (!item) return
      e.stopImmediatePropagation(); e.preventDefault()
      try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events have no active pointer */ }
      const g = this.ground(e.clientX, e.clientY, item.f)
      this.drag = { id: e.pointerId, item, sx: e.clientX, sy: e.clientY, r0: [...item.r], g, moved: false }
      this.select(item)
    }
    this._pm = (e: PointerEvent) => {
      const d = this.drag; if (!d || d.id !== e.pointerId) return
      e.stopImmediatePropagation()
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return
      d.moved = true
      const g = this.ground(e.clientX, e.clientY, d.item.f); if (!g || !d.g) return
      const dx = Math.round((g.x - d.g.x) / 5) * 5, dy = Math.round((g.y - d.g.y) / 5) * 5
      d.item.r = [d.r0[0] + dx, d.r0[1] + dy, d.r0[2] + dx, d.r0[3] + dy]; d.dx = dx; d.dy = dy
      exp.world.furniture.update(d.item)
      exp.renderer.renderRequested = true
    }
    this._pu = (e: PointerEvent) => {
      const d = this.drag; if (!d || d.id !== e.pointerId) return
      e.stopImmediatePropagation()
      this.drag = null
      try { canvas.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
      if (!d.moved || (!d.dx && !d.dy)) return
      const index = exp.world.house.items.indexOf(d.item)
      d.item.r = d.r0                                           // the house data is the app's; it answers with the edited house
      exp.trigger('itemMoved', { index, dx: d.dx, dy: d.dy })
      if (exp.world.house.items.includes(d.item)) exp.world.furniture.update(d.item)   // not taken up: back where it was
      exp.renderer.requestShadowUpdate(); exp.renderer.renderRequested = true
    }
    canvas.addEventListener('pointerdown', this._pd, true); canvas.addEventListener('pointermove', this._pm, true)
    canvas.addEventListener('pointerup', this._pu, true); canvas.addEventListener('pointercancel', this._pu, true)
  }
  setActive(on: boolean, fixed: string[] = []) { this.active = on; this.fixed = new Set(fixed); if (!on) { this.drag = null; this.select(null) } }

  _ray(cx: number, cy: number) {
    const exp = this.experience, cam = exp.camera.instance, r = exp.canvas.getBoundingClientRect()
    cam.updateMatrixWorld()
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), cam)
    return ray
  }
  /** The movable piece of this house under a screen point, unless a wall or floor is in front of it. */
  pick(cx: number, cy: number) {
    const world = this.experience.world, ray = this._ray(cx, cy)
    const hit = world.furniture?.pick(ray); if (!hit) return null
    if (this.fixed.has(hit.item.name) || world.house.items.indexOf(hit.item) < 0) return null
    const solid: THREE.Object3D[] = []
    for (const g of [...world.groups.arch, ...world.groups.int, world.groups.roof]) if (g.visible) g.traverseVisible((o: any) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.noPick && !/^glass/.test(o.userData.matKey ?? '')) solid.push(o) })
    const wall = ray.intersectObjects(solid, false)[0]
    return wall && wall.distance < hit.distance - .05 ? null : hit.item
  }
  /** Plan point where a screen point meets the floor plane of a storey. */
  ground(cx: number, cy: number, f: number) {
    const ray = this._ray(cx, cy), p = new THREE.Vector3()
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -LEVEL[f]), p)) return null
    return { x: p.x / K, y: p.z / K }
  }
  select(item: any) {
    const exp = this.experience, was = exp.world.furniture?.selected ?? null
    exp.world.furniture?.select(item)
    exp.trigger('item', item ? this.info(item) : null)
    if (was || item) exp.renderer.renderRequested = true
  }
  info(item: any) { return { index: this.experience.world.house.items.indexOf(item), floor: item.f, name: item.name, rect: [...item.r], rot: item.rot, outdoor: item.layer === 'outdoor' } }
  dispose() {
    const c = this.experience.canvas
    c.removeEventListener('pointerdown', this._pd, true); c.removeEventListener('pointermove', this._pm, true)
    c.removeEventListener('pointerup', this._pu, true); c.removeEventListener('pointercancel', this._pu, true)
  }
}
