import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { X, Z, H, LEVEL } from '../units'

// Lighting: golden-hour sun with a static shadow map, neutral interior environment (PMREM), garden backdrop,
// time-of-day presets, a POOL of 4 point lights that moves to the active storey (constant light count → no shader
// recompiles, no per-window area lights), and shadow-only tree canopies for dappled sunlight.
export const TIMES = {
  morning: { az: 115, el: 22, color: 0xffd7ae, sun: 3.6, exp: .95, env: .5, hemi: .2, bg: 1.3 },
  noon:    { az: 200, el: 52, color: 0xfff4e6, sun: 3.8, exp: .9, env: .55, hemi: .22, bg: 1.3 },
  golden:  { az: 248, el: 17, color: 0xffbf7e, sun: 7, exp: 1.12, env: .45, hemi: .14, bg: 1.0 },
  evening: { az: 255, el: 12, color: 0xffad6e, sun: 2.6, exp: 1.0, env: .3, hemi: .08, bg: .8 },
}
// Look by sun elevation (degrees), between the presets above
const KEYS = [
  { el: -6, color: 0x8ea4d8, sun: 0, exp: .95, env: .1, hemi: .03, bg: .18 },
  { el: 2, color: 0xff9a5a, sun: 1.6, exp: 1.0, env: .25, hemi: .06, bg: .6 },
  { ...TIMES.evening, el: 12 }, { ...TIMES.golden, el: 17 }, { ...TIMES.morning, el: 24 },
  { ...TIMES.noon, el: 52 }, { ...TIMES.noon, el: 90 },
]
function lookFor(el) {
  let i = 1; while (i < KEYS.length - 1 && KEYS[i].el < el) i++
  const a = KEYS[i - 1], b = KEYS[i], f = Math.max(0, Math.min(1, (el - a.el) / (b.el - a.el)))
  const mix = (p, q) => p + (q - p) * f
  return { color: new THREE.Color(a.color).lerp(new THREE.Color(b.color), f), sun: mix(a.sun, b.sun), exp: mix(a.exp, b.exp), env: mix(a.env, b.env), hemi: mix(a.hemi, b.hemi), bg: mix(a.bg, b.bg) }
}
export default class Environment {
  [key: string]: any
  constructor(world, resources, renderer, kit) {
    this.world = world
    const scene = world.scene
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.envMap = this.pmrem.fromScene(new RoomEnvironment(), .04).texture
    scene.environment = this.envMap
    scene.background = resources.items.sky || new THREE.Color(0xcfe0ec)
    scene.backgroundRotation.set(0, Math.PI * .5, 0)

    this.center = new THREE.Vector3(X(575), 0, Z(780))
    this.sun = new THREE.DirectionalLight(0xfff2e0, 3)
    this.sun.castShadow = true
    Object.assign(this.sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 70 })
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.025; this.sun.shadow.radius = 3
    this.sun.target.position.copy(this.center)
    this.hemi = new THREE.HemisphereLight(0xffe4c4, 0xb8a58c, .14)
    scene.add(this.sun, this.sun.target, this.hemi)

    // lamp pool
    this.kit = kit
    this.lamps = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffd6a3, 9, 6, 2); l.visible = false; scene.add(l); return l })

    // shadow-only canopies (visible only while the shadow map is rendered)
    let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const leafTex = world.materials.canvasTex(512, 512, (g, w, h) => {
      for (let i = 0; i < 330; i++) { g.save(); g.translate(rnd() * w, rnd() * h); g.rotate(rnd() * 6.28); g.fillStyle = '#2f4a22'; g.beginPath(); const r = 6 + rnd() * 16; g.ellipse(0, 0, r, r * .42, 0, 0, 7); g.fill(); g.restore() }
      g.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 14 + rnd() * 40, 0, 7); g.fill() }
    }, true)
    this.leafMat = new THREE.MeshBasicMaterial({ map: leafTex, alphaTest: .5, side: THREE.DoubleSide })
    this.canopyGeo = new THREE.PlaneGeometry(1, 1)
    this.canopies = new THREE.Group(); this.canopies.visible = false; scene.add(this.canopies)
    for (const [xp, yp, y, sz] of world.house.canopies) for (const dy of [0, LEVEL[0]]) {
      const m = new THREE.Mesh(this.canopyGeo, this.leafMat); m.scale.setScalar(sz); m.position.set(X(xp), y + dy, Z(yp)); m.castShadow = true; this.canopies.add(m)
    }
    this.setTime(world.experience.state.time)
  }
  setTime(k) {
    const t = TIMES[k]
    this._apply(t.az, t.el, t, k)
  }
  // Real sun (custom time): azimuth in the PLAN frame (0 = top of the sheet, clockwise), elevation in degrees.
  // Look values are interpolated from the tuned presets by elevation; below the horizon it is night.
  setSun(az, el) {
    const t = lookFor(el)
    this._apply(az, Math.max(el, 2), t, 'custom')
    if (el < -2 && !this.world.experience.state.lights) this.setLights(true)
  }
  _apply(azDeg, elDeg, t, k) {
    const exp = this.world.experience, r = exp.renderer
    exp.state.time = k
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg)
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))   // +z = south, +x = east
    this.sun.position.copy(this.center).addScaledVector(dir, 30)
    this.sun.color.set(t.color); this.sun.intensity = t.sun
    for (const c of this.canopies.children) c.lookAt(c.position.clone().add(dir))
    r.instance.toneMappingExposure = t.exp
    const scene = this.world.scene
    scene.environmentIntensity = t.env; scene.backgroundIntensity = t.bg
    this.hemi.intensity = t.hemi
    const M = this.world.materials.list
    M.ledStrip.emissiveIntensity = k === 'evening' || t.sun < 1 ? 6 : k === 'golden' || t.sun > 5 ? 3.5 : 1.5
    if (k === 'evening' && !exp.state.lights) this.setLights(true)
    r.requestShadowUpdate()
    exp.trigger('time', k)
  }
  setLights(on) {
    const exp = this.world.experience; exp.state.lights = on
    const M = this.world.materials.list
    M.lightDisc.emissiveIntensity = on ? 8 : .4; M.ringLed.emissiveIntensity = on ? 10 : 2
    this.placeLamps(exp.state.floor)
    exp.trigger('lights', on)
  }
  // Move the 4 pooled lamps to the 4 downlights nearest the camera on the active storey.
  placeLamps(floor, near?) {
    const on = this.world.experience.state.lights, pts = this.kit.lightPoints[floor] || []
    const ref = near || { x: 575, y: 800 }
    const sorted = [...pts].sort((a, b) => Math.hypot(a[0] - ref.x, a[1] - ref.y) - Math.hypot(b[0] - ref.x, b[1] - ref.y))
    this.lamps.forEach((l, i) => { const p = sorted[i]; l.visible = on && !!p; if (p) l.position.set(X(p[0]), LEVEL[floor] + H - .15, Z(p[1])) })
  }
  dispose() {
    const scene = this.world.scene
    scene.remove(this.sun, this.sun.target, this.hemi, this.canopies, ...this.lamps)
    this.sun.shadow.map?.dispose(); this.sun.dispose(); this.hemi.dispose(); this.lamps.forEach(l => l.dispose())
    this.canopyGeo.dispose(); this.leafMat.dispose(); this.envMap.dispose(); this.pmrem.dispose()
    scene.environment = null; scene.background = null
  }
}
