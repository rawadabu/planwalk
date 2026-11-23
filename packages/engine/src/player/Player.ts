import * as THREE from 'three'
import Experience from '../Experience'
import Collision from './Collision'
import { K, X, Z, EYE, LEVEL } from '../world/units'

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// First-person walker: keyboard / drag-look / touch joystick, smoothed velocity, capsule collision,
// walking the stairs between storeys, minimap teleports, and the walk ↔ top-view mode switch.
export default class Player {
  [key: string]: any
  constructor() {
    this.experience = new Experience()
    this.camera = this.experience.camera
    this.p = { x: 568, y: 1365, vx: 0, vy: 0, bob: 0 }
    this.look = { yaw: 0, pitch: -0.06 }
    this.keys = {}
    this.jv = { x: 0, y: 0 }
    this.climb = null
    this.teleport = null
    this.ready = false
    this._bindInput()
    this.experience.on('worldReady', house => this._init(house))
  }
  _init(house) {
    this.house = house
    this.collision = new Collision(house)
    this.floors = house.floors
    this.stairs = house.stairs
    const s = this.floors[1].start
    Object.assign(this.p, { x: s.x, y: s.y }); this.look.yaw = s.yaw
    this.ready = true
  }
  /** After a geometry edit: new walls to collide with. */
  useHouse(house) { this.house = house; this.collision = new Collision(house); this.floors = house.floors; this.stairs = house.stairs }
  _bindInput() {
    const exp = this.experience, canvas = exp.canvas
    this._kd = e => { if (e.target.closest?.('button,input')) return; this.keys[e.key.toLowerCase()] = true }
    this._ku = e => { this.keys[e.key.toLowerCase()] = false }
    this._blur = () => { for (const k in this.keys) this.keys[k] = false }
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('blur', this._blur)
    this.drag = null
    this._pd = e => { if (exp.state.mode !== 'walk' || this.climb || this.camera.tween) return; this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId) }
    this._pm = e => { if (!this.drag || this.drag.id !== e.pointerId) return; this.look.yaw -= (e.clientX - this.drag.x) * .0042; this.look.pitch = Math.max(-1.1, Math.min(1.1, this.look.pitch - (e.clientY - this.drag.y) * .0034)); this.drag.x = e.clientX; this.drag.y = e.clientY }
    this._pu = e => { if (this.drag && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) < 6) exp.trigger('tap', e); this.drag = null }
    canvas.addEventListener('pointerdown', this._pd); canvas.addEventListener('pointermove', this._pm)
    canvas.addEventListener('pointerup', this._pu); canvas.addEventListener('pointercancel', this._pu)
  }

  walkPose() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'))
    return { pos: new THREE.Vector3(X(this.p.x), EYE + LEVEL[this.experience.state.floor], Z(this.p.y)), q }
  }
  setMode(m) {
    const exp = this.experience, cam = this.camera
    if (m === 'top' || m === 'outside') {
      cam.orbit.enabled = false
      exp.setMode(m)
      cam.tweenTo(m === 'top' ? cam.topPose(LEVEL[exp.state.floor]) : cam.outsidePose(), 1.3, () => { cam.orbit.enabled = true })
    } else {
      cam.orbit.enabled = false
      exp.setMode('trans')
      cam.tweenTo(() => this.walkPose(), 1.3, () => exp.setMode('walk'))
    }
  }
  setFloor(f, at) {
    const exp = this.experience, a = at || this.stairs.arrive[f], from = exp.state.floor
    exp.setFloor(f)
    const spot = this.collision.free(f, a.x, a.y) || a
    Object.assign(this.p, { x: spot.x, y: spot.y, vx: 0, vy: 0 }); this.look.yaw = a.yaw ?? this.look.yaw; this.look.pitch = -0.05
    if (exp.state.mode === 'top') { this.camera.orbit.enabled = false; this.camera.tweenTo(this.camera.topPose(LEVEL[f]), .9, () => { this.camera.orbit.enabled = true }) }
    else if (exp.state.mode === 'outside') { /* stay outside; the storey only matters once you walk in */ }
    else if (from !== f) { exp.setMode('trans'); this.camera.tweenTo(() => this.walkPose(), 1.0, () => exp.setMode('walk')) }
  }
  teleportTo(x, y) {
    const exp = this.experience, spot = this.collision.free(exp.state.floor, x, y, 160)
    if (!spot) return
    if (exp.state.mode !== 'walk') { Object.assign(this.p, spot); this.setMode('walk'); return }
    this.teleport = { from: { x: this.p.x, y: this.p.y }, to: spot, t: 0 }
  }

  // ---- stairs: follow a polyline through the treads, then switch storey ----
  startClimb(dir) {
    const exp = this.experience
    if (this.climb || exp.state.mode !== 'walk' || this.camera.tween) return
    const cur = exp.state.floor, to = cur + dir
    if (to < 0 || to > 2) return
    const base = dir > 0 ? cur : to, step = this.stairs.step
    if (!this.stairs.path[base] || !this.stairs.exit[base]) return          // no stair between these storeys
    const path = this.stairs.path[base].map(([x, y, s]) => ({ x, y, h: LEVEL[base] + s * step }))
    const [ex, ey] = this.stairs.exit[base]
    const exit = { x: ex, y: ey, h: LEVEL[base + 1] }, here = { x: this.p.x, y: this.p.y, h: LEVEL[cur] }
    const pts = dir > 0 ? [here, ...path, exit] : [here, exit, ...path.reverse()]
    let len = 0; const seg = [0]
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; len += Math.hypot(X(b.x - a.x), Z(b.y - a.y), b.h - a.h); seg.push(len) }
    this.climb = { pts, seg, len, t: 0, dur: Math.max(2.5, len / (this.camera.reduceMotion ? 3 : 1.05)), to }
    this.p.vx = this.p.vy = 0
  }
  _stepClimb(dt) {
    const c = this.climb, exp = this.experience
    c.t += dt / c.dur
    const d = ease(Math.min(1, c.t)) * c.len
    let i = 1; while (i < c.seg.length - 1 && c.seg[i] < d) i++
    const a = c.pts[i - 1], b = c.pts[i], f = (d - c.seg[i - 1]) / Math.max(1e-6, c.seg[i] - c.seg[i - 1])
    this.p.x = a.x + (b.x - a.x) * f; this.p.y = a.y + (b.y - a.y) * f
    const h = a.h + (b.h - a.h) * f, dx = b.x - a.x, dy = b.y - a.y
    if (Math.hypot(dx, dy) > 1) { let dyaw = Math.atan2(-dx, -dy) - this.look.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); this.look.yaw += dyaw * Math.min(1, dt * 4) }
    const slope = (b.h - a.h) / Math.max(.01, Math.hypot(X(dx), Z(dy)))
    this.look.pitch += (Math.max(-.35, Math.min(.35, slope * .45)) - this.look.pitch) * Math.min(1, dt * 3)
    this.p.bob += dt * 6.5
    const bob = exp.state.headBob && !this.camera.reduceMotion ? Math.sin(this.p.bob) * .02 : 0
    this.camera.instance.position.set(X(this.p.x), h + EYE + bob, Z(this.p.y))
    this.camera.instance.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ')
    if (c.t >= 1) { this.climb = null; exp.setFloor(c.to); this.look.pitch = -.05 }
  }

  update(dt) {
    const exp = this.experience
    if (!this.ready) return
    this._report()
    if (this.climb) return this._stepClimb(dt)
    if (exp.state.mode !== 'walk' || this.camera.tween) return
    const k = this.keys, p = this.p, look = this.look, cur = exp.state.floor
    let f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0) - this.jv.y
    let s = (k.d ? 1 : 0) - (k.a ? 1 : 0) + this.jv.x
    if (k.arrowleft) look.yaw += 1.6 * dt; if (k.arrowright) look.yaw -= 1.6 * dt
    const mag = Math.hypot(f, s); if (mag > 1) { f /= mag; s /= mag }
    const speed = (k.shift ? 2.4 : 1.3) / K
    const fx = -Math.sin(look.yaw), fy = -Math.cos(look.yaw), rx = Math.cos(look.yaw), ry = -Math.sin(look.yaw)
    const tvx = (fx * f + rx * s) * speed, tvy = (fy * f + ry * s) * speed
    const acc = Math.min(1, dt * (mag > 0 ? 7 : 10))
    p.vx += (tvx - p.vx) * acc; p.vy += (tvy - p.vy) * acc
    if (this.teleport) {
      const t = this.teleport; t.t += dt / .7; const e = ease(Math.min(1, t.t))
      p.x = t.from.x + (t.to.x - t.from.x) * e; p.y = t.from.y + (t.to.y - t.from.y) * e
      if (t.t >= 1) this.teleport = null
    } else {
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt
      if (!this.collision.blocked(cur, nx, p.y)) p.x = nx; else p.vx = 0
      if (!this.collision.blocked(cur, p.x, ny)) p.y = ny; else p.vy = 0
      // walking toward the stairs starts the climb (intended direction, so furniture by the stair foot can't block it)
      const T = this.stairs.trigger[cur]
      if (T) {
        const ddx = T[0] - p.x, ddy = T[1] - p.y, dist = Math.hypot(ddx, ddy), dir = T[3] || [ddx / (dist || 1), ddy / (dist || 1)]
        if (dist < T[2] && (tvx * dir[0] + tvy * dir[1]) > 60) this.startClimb(cur === 2 && !this.stairs.down ? -1 : 1)
      }
      // …and walking into the top of the stair below goes down
      const D = this.stairs.down?.[cur]
      if (D && !this.climb) {
        const ddx = D[0] - p.x, ddy = D[1] - p.y, dist = Math.hypot(ddx, ddy), dir = D[3] || [ddx / (dist || 1), ddy / (dist || 1)]
        if (dist < D[2] && (tvx * dir[0] + tvy * dir[1]) > 60) this.startClimb(-1)
      }
    }
    const v = Math.hypot(p.vx, p.vy) * K
    p.bob += dt * v * 5.2
    const bob = exp.state.headBob && !this.camera.reduceMotion ? Math.sin(p.bob) * .018 * Math.min(1, v / 1.3) : 0
    this.camera.instance.position.set(X(p.x), EYE + bob + LEVEL[cur], Z(p.y))
    this.camera.instance.rotation.set(look.pitch, look.yaw, 0, 'YXZ')
    // keep the pooled lamps near the walker (cheap: once every ~0.5 s)
    this._lampT = (this._lampT || 0) + dt
    if (this._lampT > .5 && exp.state.lights) { this._lampT = 0; exp.world.environment?.placeLamps(cur, p) }
  }
  _report() {
    const exp = this.experience, p = this.p, f = exp.state.floor
    exp.trigger('pose', { x: p.x, y: p.y, yaw: this.look.yaw, floor: f })
    const rooms = this.floors[f].rooms
    const room = rooms.find(r => p.x >= r[2] && p.x < r[4] && p.y >= r[3] && p.y < r[5]) || null
    if (room !== this._room) { this._room = room; exp.trigger('room', room) }
    const near = this.nearStair()
    if (near !== this._near) { this._near = near; exp.trigger('nearStair', near) }
  }
  nearStair() {
    const z = this.stairs?.zone[this.experience.state.floor]; if (!z || this.climb || this.experience.state.mode !== 'walk') return false
    return this.p.x > z[0] && this.p.y > z[1] && this.p.x < z[2] && this.p.y < z[3]
  }
  dispose() {
    const c = this.experience.canvas
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('blur', this._blur)
    c.removeEventListener('pointerdown', this._pd); c.removeEventListener('pointermove', this._pm); c.removeEventListener('pointerup', this._pu); c.removeEventListener('pointercancel', this._pu)
  }
}
