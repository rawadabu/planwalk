import Experience from './Experience'
import * as THREE from 'three'
import type { Viewer, ViewerEvents, ViewerOptions } from './types'
import { sunPosition } from './sun'
import { K, X, Z, LEVEL } from './world/units'
import type { StoreyId } from '@planwalk/house'

export type * from './types'
export { sunPosition }

/**
 * Create a viewer on a canvas. One viewer per page (the engine is a singleton);
 * call destroy() before creating another (React StrictMode mounts twice in dev — handled by the hook).
 */
export function createViewer(options: ViewerOptions): Viewer {
  const exp = new Experience(options)
  // automated visual checks (?test) can pose the camera directly
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('test')) (globalThis as any).__exp = exp
  const subs: Array<() => void> = []
  const on = <K extends keyof ViewerEvents>(event: K, handler: ViewerEvents[K]) => {
    exp.on(event, handler as (...a: unknown[]) => void)
    const off = () => exp.off(event, handler as (...a: unknown[]) => void)
    subs.push(off)
    return off
  }
  // bridge internal events to the public ones
  exp.resources.on('progress', (a: number, b: number) => exp.trigger('progress', a, b))
  exp.on('worldReady', (house: unknown) => exp.trigger('ready', house))

  return {
    on,
    get state() { return exp.state },
    setFloor: f => exp.player.setFloor(f, exp.world.house?.floors[f].start),
    setMode: m => { if (m !== exp.state.mode) exp.player.setMode(m) },
    setTime: t => exp.world.environment?.setTime(t),
    setSunAt: ({ date, lat, lng, north = 0 }) => {
      const s = sunPosition(date, lat, lng)
      exp.world.environment?.setSun(s.az + north, s.el)
      exp.trigger('sun', s)
      return s
    },
    setStory: t => {
      const st = exp.story
      if (t == null) { st.exit(); return }
      st.set(t)
      if (!st.active) { if (exp.world.ready) { st.t = t; st.enter() } else exp.on('worldReady', () => { if (!st.active) { st.t = st.target; st.enter() } }) }
    },
    setFinish: (slot, option) => { exp.world.materials?.setFinish(slot, option); exp.renderer.requestRender?.() },
    applyDesign: (looks, rooms = []) => { if (exp.world.ready) exp.world.applyLooks(looks, rooms); else exp.on('worldReady', () => exp.world.applyLooks(looks, rooms)) },
    pickSurface: (cx, cy) => {
      const cam = exp.camera.instance, r = exp.canvas.getBoundingClientRect(), world = exp.world
      cam.updateMatrixWorld()
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), cam)
      const targets: THREE.Object3D[] = []
      for (const g of [...world.groups.arch, ...world.groups.int, world.groups.roof]) if (g.visible) g.traverseVisible((o: THREE.Object3D) => { if ((o as THREE.Mesh).isMesh && !o.userData.noPick) targets.push(o) })
      const hit = ray.intersectObjects(targets, false)[0]
      if (!hit) return null
      const key = hit.object.userData.baseKey ?? hit.object.userData.matKey
      const inArch = world.groups.arch.some(g => g === hit.object.parent)
      const PART = { floor: 'floor', wall: 'walls', ceil: 'ceiling', walnut: 'joinery', quartz: 'worktop', ...(inArch ? { metal: 'frames', glass: 'frames', glassSimple: 'frames', glassPhysical: 'frames' } : {}) }
      const part = PART[key]; if (!part) return null
      // step 5 cm off the surface towards the camera, so a wall hit lands in the room it faces
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3()
      if (n.dot(ray.ray.direction) > 0) n.negate()
      const p = hit.point.clone().addScaledVector(n, .05)
      const floor = (([2, 1, 0] as StoreyId[]).find(f => p.y >= LEVEL[f] - 0.05) ?? 0)
      const x = p.x / K, y = p.z / K, fl = world.house.floors[floor]
      const room = fl.rooms.slice(0, fl.indoor).findIndex(rm => x >= rm[2] && x < rm[4] && y >= rm[3] && y < rm[5])
      const out: any = { part, floor, room: room >= 0 ? room : null, roomName: room >= 0 ? fl.rooms[room][0] : null, x: Math.round(x), y: Math.round(y) }
      // the raw hit (not nudged): which window, or which wall face
      const hx = hit.point.x / K, hy = hit.point.z / K
      if (part === 'frames') {
        let best = -1, bd = 14
        fl.glass.forEach((g, i) => { const dx = Math.max(g[0] - hx, 0, hx - g[2]), dy = Math.max(g[1] - hy, 0, hy - g[3]), d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i } })
        if (best >= 0) out.window = best
      }
      if (part === 'walls' && hit.face) {
        const wn = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        if (Math.abs(wn.y) < .5) out.face = Math.abs(wn.x) > Math.abs(wn.z) ? { axis: 'x', at: Math.round(hx * 10) / 10 } : { axis: 'y', at: Math.round(hy * 10) / 10 }
      }
      return out
    },
    setHouse: house => { if (exp.world.ready) exp.world.rebuild(house); else exp.on('worldReady', () => exp.world.rebuild(house)) },
    highlight: sel => { exp.world.roomSkins?.highlight(sel); exp.renderer.renderRequested = true },
    pick: (cx, cy) => {
      const cam = exp.camera.instance, r = exp.canvas.getBoundingClientRect()
      cam.updateMatrixWorld()
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), cam)
      const targets: THREE.Object3D[] = []
      for (const g of [...exp.world.groups.arch, ...exp.world.groups.int, exp.world.groups.roof]) if (g.visible) g.traverseVisible((o: THREE.Object3D) => { if ((o as THREE.Mesh).isMesh) targets.push(o) })
      const hit = ray.intersectObjects(targets, false).find(h => !(h.object as THREE.Mesh).userData?.noPick)
      if (!hit) return null
      const p = hit.point
      const floor = ([2, 1, 0] as StoreyId[]).find(f => p.y >= LEVEL[f] - 0.05) ?? 0
      return { floor, x: Math.round(p.x / K), y: Math.round(p.z / K), h: Math.max(0, +(p.y - LEVEL[floor]).toFixed(2)) }
    },
    toScreen: ({ floor, x, y, h }) => {
      const r = exp.canvas.getBoundingClientRect()
      const v = new THREE.Vector3(X(x), LEVEL[floor] + h, Z(y)).project(exp.camera.instance)
      return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 }
    },
    setQuality: q => exp.renderer.setQuality(q),
    setLights: on => exp.world.environment?.setLights(on),
    setHeadBob: on => { exp.state.headBob = on },
    climb: dir => exp.player.startClimb(dir),
    teleport: (x, y) => exp.player.teleportTo(x, y),
    look: (yaw, pitch) => { const l = exp.player.look; l.yaw = yaw; if (pitch != null) l.pitch = pitch },
    goTo: (floor, x, y, yaw) => { if (exp.state.mode !== 'walk') exp.player.setMode('walk'); exp.player.setFloor(floor, { x, y, yaw }) },
    setJoystick: (x, y) => { exp.player.jv = { x, y } },
    setMeasuring: on => exp.measure.setActive(on),
    resetView: () => { const h = exp.world.house; if (!h) return; exp.player.setFloor(1, h.floors[1].start); if (exp.state.mode !== 'walk') exp.player.setMode('walk') },
    stats: () => { const i = exp.renderer.instance.info; return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0 } },
    requestRender: () => { exp.renderer.renderRequested = true },
    destroy: () => { subs.forEach(off => off()); exp.destroy() },
  }
}
