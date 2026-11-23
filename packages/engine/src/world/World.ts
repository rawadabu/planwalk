import * as THREE from 'three'
import Experience from '../Experience'
import Materials from './Materials'
import StaticBatcher from './StaticBatcher'
import Architecture from './components/Architecture'
import Kit from './components/Kit'
import Fireplace from './components/Fireplace'
import RoomSkins from './components/RoomSkins'
import Furniture from './components/Furniture'
import { registerGarden } from './components/Garden'
import Environment from './components/Environment'

// Builds the house described by house.json once Resources are ready, and owns per-storey visibility:
//   arch[f] = structure of storey f (always visible while walking, so the house looks whole from outside)
//   int[f]  = interior of storey f (only the active storey and the one you can see through the void are drawn)
import Neighbourhood from './components/Neighbourhood'
import { setStorey } from './units'
import PlanCaps from './components/PlanCaps'

export default class World {
  [key: string]: any
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.ready = false
    this.groups = { arch: [0, 1, 2].map(() => new THREE.Group()), int: [0, 1, 2].map(() => new THREE.Group()), outdoor: new THREE.Group(), roof: new THREE.Group() }
    for (const g of [...this.groups.arch, ...this.groups.int, this.groups.outdoor, this.groups.roof]) this.scene.add(g)
    this.scene.background = new THREE.Color(0xcfdbe4)
    this.experience.resources.on('ready', () => this.build())
    this._onFloor = () => this.updateVisibility()
    this._onQuality = (name, q) => this.applyQuality(q)
    this.experience.on('floor', this._onFloor).on('mode', this._onFloor).on('quality', this._onQuality)
  }

  build() {
    const exp = this.experience, res = exp.resources
    this.house = res.items.house
    if (!this.house) { exp.trigger('error', 'Could not load the house data'); return }
    setStorey(this.house.storey?.height, this.house.storey?.slab)              // before anything is built: every height follows
    this.materials = new Materials(res, res.maxAniso)
    this.batcher = new StaticBatcher(this.materials, this.groups)
    this.caps?.dispose(); this.caps = new PlanCaps(this)
    this.architecture = new Architecture(this)
    this.kit = new Kit(this)
    this.neighbourhood = new Neighbourhood(this)
    this.batcher.flush()
    this.fireplace = new Fireplace(this, this.kit.firePoints, this.materials)
    this.roomSkins = new RoomSkins(this)
    registerGarden(res.items, this.materials.list)     // built-in garden pieces, placed like any other model
    this.furniture = new Furniture(this, res)
    this.environment = new Environment(this, res, exp.renderer.instance, this.kit)
    // static content: no per-frame matrix work
    this.scene.traverse(o => { if (o.isMesh && o.matrixAutoUpdate) { o.updateMatrix(); o.matrixAutoUpdate = false } })
    this.applyQuality(exp.renderer.preset)
    this.ready = true
    this.updateVisibility()
    exp.renderer.requestShadowUpdate()
    exp.trigger('worldReady', this.house)
  }

  /** Rebuild the static house from an edited copy (design edits). Furniture, lights and the environment stay. */
  rebuild(house) {
    const exp = this.experience
    this.house = house
    setStorey(house.storey?.height, house.storey?.slab)
    this.batcher.dispose(); this.fireplace?.dispose(); this.roomSkins?.dispose()
    if (exp.story?.built) { exp.story.dispose(); exp.story.built = false }
    this.caps?.dispose(); this.caps = new PlanCaps(this)
    this.architecture = new Architecture(this)
    this.kit = new Kit(this)
    this.neighbourhood = new Neighbourhood(this)
    this.batcher.flush()
    this.fireplace = new Fireplace(this, this.kit.firePoints, this.materials)
    this.roomSkins = new RoomSkins(this)
    this.furniture.dispose(); this.furniture = new Furniture(this, exp.resources)
    this.environment.kit = this.kit
    for (const g of [...this.groups.arch, ...this.groups.int, this.groups.outdoor, this.groups.roof]) g.traverse(o => { if (o.isMesh && o.matrixAutoUpdate) { o.updateMatrix(); o.matrixAutoUpdate = false } })
    this.applyQuality(exp.renderer.preset)
    this.updateVisibility()
    exp.player.useHouse(house)
    exp.renderer.requestShadowUpdate()
    this.environment.requestProbes()
  }

  /** Only the furniture changed (a piece moved, was added or removed): redraw it and nothing else. */
  setFurniture(house) {
    const exp = this.experience
    this.house = house
    this.furniture.dispose(); this.furniture = new Furniture(this, exp.resources)
    for (const m of this.furniture.meshes) { m.updateMatrix(); m.matrixAutoUpdate = false; m.updateMatrixWorld(true) }
    exp.renderer.requestShadowUpdate(); exp.renderer.renderRequested = true
  }

  inRoom(f, x, y) {
    const fl = this.house.floors[f]
    return fl.rooms.slice(0, fl.indoor).some(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5])
  }

  updateVisibility() {
    if (!this.ready) return
    const { floor, mode } = this.experience.state, top = mode === 'top', outside = mode === 'outside'
    if (mode === 'story') return                     // the story drives visibility itself
    this.groups.arch.forEach((g, i) => { g.visible = outside || !top || i <= floor })
    const seeInt = { 0: [0], 1: [1, 2], 2: [1, 2] }[floor]
    this.groups.int.forEach((g, i) => { g.visible = outside ? i > 0 : top ? i <= floor && i >= floor - 1 : seeInt.includes(i) })
    this.groups.roof.visible = !top
    this.caps?.show(top ? floor : -1)                // the plan's cut through the walls
    this.environment.placeLamps(floor)
    this.environment.useProbe()
  }

  // ── design looks: swap materials per part and storey, keeping the base material to come back to ──
  applyLooks(looks, rooms: any[] = []) {
    const M = this.materials, G = this.groups
    const KEY = { floor: 'floor', walls: 'wall', ceiling: 'ceil', joinery: 'walnut', worktop: 'quartz', frames: 'metal' }
    // which meshes a part covers on storey f (a storey's ceiling is the underside of the slab above it, or the roof)
    const meshes = (part, f) => {
      const key = KEY[part], out: any[] = []
      const groups = part === 'joinery' || part === 'worktop' ? [G.int[f]] : part === 'ceiling' ? [f < 2 ? G.arch[f + 1] : G.roof] : [G.arch[f]]
      for (const g of groups) g.traverse(o => { if (o.isMesh && !o.userData.skin && (o.userData.baseKey ?? o.userData.matKey) === key) out.push(o) })
      return out
    }
    for (const part of Object.keys(KEY)) for (const f of [0, 1, 2]) {
      const look = looks[part]?.[f] ?? null
      for (const m of meshes(part, f)) {
        if (!m.userData.baseMat) { m.userData.baseMat = m.material; m.userData.baseKey = m.userData.matKey }
        m.material = look ? M.lookMaterial(KEY[part], look) : m.userData.baseMat
      }
    }
    this.roomSkins.apply(rooms)
    this.experience.renderer.requestShadowUpdate()
    this.environment.requestProbes()
  }

  // Render the shadow map with everything that should cast (all storeys + shadow-only canopies), then restore.
  prepareShadowPass(on) {
    const all = [...this.groups.arch, ...this.groups.int, this.groups.roof]
    const story = this.experience.story?.active      // during the story only what is built casts shadows
    if (on) { this._vis = all.map(g => g.visible); if (!story) all.forEach(g => g.visible = true); this.environment.canopies.visible = true }
    else { all.forEach((g, i) => g.visible = this._vis[i]); this.environment.canopies.visible = false }
  }

  applyQuality(q) {
    if (!this.materials) return
    const glass = q.glass === 'physical' ? this.materials.list.glassPhysical : this.materials.list.glassSimple
    this.materials.list.glass = glass
    this.scene.traverse(o => { if (o.isMesh && o.userData.matKey === 'glass') o.material = glass })
    this.environment?.sun.shadow.mapSize.set(q.shadow, q.shadow)
    if (this.environment?.sun.shadow.map) { this.environment.sun.shadow.map.dispose(); this.environment.sun.shadow.map = null }
  }

  update(dt, elapsed) {
    if (!this.ready) return
    this.fireplace.update(elapsed)
    this.environment.update(dt)
  }

  dispose() {
    const exp = this.experience
    exp.off('floor', this._onFloor).off('mode', this._onFloor).off('quality', this._onQuality)
    this.roomSkins?.dispose(); this.fireplace?.dispose(); this.furniture?.dispose(); this.environment?.dispose(); this.batcher?.dispose(); this.materials?.dispose()
    for (const g of [...this.groups.arch, ...this.groups.int, this.groups.outdoor, this.groups.roof]) { g.clear(); this.scene.remove(g) }
    this.ready = false
  }
}
