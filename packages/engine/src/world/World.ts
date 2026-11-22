import * as THREE from 'three'
import Experience from '../Experience'
import Materials from './Materials'
import StaticBatcher from './StaticBatcher'
import Architecture from './components/Architecture'
import Kit from './components/Kit'
import Fireplace from './components/Fireplace'
import Furniture from './components/Furniture'
import Environment from './components/Environment'

// Builds the house described by house.json once Resources are ready, and owns per-storey visibility:
//   arch[f] = structure of storey f (always visible while walking, so the house looks whole from outside)
//   int[f]  = interior of storey f (only the active storey and the one you can see through the void are drawn)
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
    this.materials = new Materials(res, res.maxAniso)
    this.batcher = new StaticBatcher(this.materials, this.groups)
    this.architecture = new Architecture(this)
    this.kit = new Kit(this)
    this.batcher.flush()
    this.fireplace = new Fireplace(this, this.kit.firePoints, this.materials)
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

  inRoom(f, x, y) {
    const fl = this.house.floors[f]
    return fl.rooms.slice(0, fl.indoor).some(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5])
  }

  updateVisibility() {
    if (!this.ready) return
    const { floor, mode } = this.experience.state, top = mode === 'top'
    this.groups.arch.forEach((g, i) => { g.visible = !top || i <= floor })
    const seeInt = { 0: [0], 1: [1, 2], 2: [1, 2] }[floor]
    this.groups.int.forEach((g, i) => { g.visible = top ? i <= floor && i >= floor - 1 : seeInt.includes(i) })
    this.groups.roof.visible = !top
    this.environment.placeLamps(floor)
  }

  // Render the shadow map with everything that should cast (all storeys + shadow-only canopies), then restore.
  prepareShadowPass(on) {
    const all = [...this.groups.arch, ...this.groups.int, this.groups.roof]
    if (on) { this._vis = all.map(g => g.visible); all.forEach(g => g.visible = true); this.environment.canopies.visible = true }
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
  }

  dispose() {
    const exp = this.experience
    exp.off('floor', this._onFloor).off('mode', this._onFloor).off('quality', this._onQuality)
    this.fireplace?.dispose(); this.furniture?.dispose(); this.environment?.dispose(); this.batcher?.dispose(); this.materials?.dispose()
    for (const g of [...this.groups.arch, ...this.groups.int, this.groups.outdoor, this.groups.roof]) { g.clear(); this.scene.remove(g) }
    this.ready = false
  }
}
