import * as THREE from 'three'
import EventEmitter from './core/EventEmitter'
import Sizes from './core/Sizes'
import Time from './core/Time'
import Resources from './core/Resources'
import sources, { siteSources } from './sources'
import Camera from './Camera'
import Renderer from './Renderer'
import World from './world/World'
import Player from './player/Player'
import Measure from './player/Measure'
import Arrange from './player/Arrange'
import Story from './world/Story'
import type { ViewerOptions, Mode, Quality, TimeOfDay } from './types'
import type { StoreyId } from '@planwalk/house'

let instance: Experience | null = null

/**
 * Owns every subsystem of one viewer. Framework-free: no DOM except the canvas it renders into.
 * Internal events: 'floor', 'mode', 'quality', 'worldReady', 'tap', 'time', 'lights'.
 * Public events (see types.ts) are re-emitted by index.ts.
 */
export default class Experience extends EventEmitter {
  [key: string]: any
  canvas!: HTMLCanvasElement
  options!: ViewerOptions
  state!: { mode: Mode; floor: StoreyId; quality: Quality; time: TimeOfDay; lights: boolean; headBob: boolean }

  constructor(options?: ViewerOptions) {
    if (instance) return instance
    super()
    if (!options) throw new Error('Experience: first construction needs options')
    instance = this
    this.options = options
    this.canvas = options.canvas
    this.test = !!options.manualRender
    this.state = { mode: 'walk', floor: 1, quality: options.quality || 'medium', time: 'golden', lights: false, headBob: true }

    this.sizes = new Sizes(this.canvas)
    this.time = new Time()
    this.scene = new THREE.Scene()
    this.camera = new Camera()
    this.renderer = new Renderer()
    this.resources = new Resources(sources(options.houseUrl, options.libraryUrl), this.renderer.instance, options.workerUrl, siteSources(options.libraryUrl))
    this.world = new World()
    this.player = new Player()
    this.measure = new Measure()
    this.arrange = new Arrange()
    this.story = new Story()

    this._onResize = () => { this.camera.resize(); this.renderer.resize() }
    this._onTick = () => this.update()
    this.sizes.on('resize', this._onResize)
    this.time.on('tick', this._onTick)
  }

  update() {
    const dt = this.time.delta
    this.player.update(dt)
    this.camera.update(dt)
    this.story.update(dt)
    this.world.update(dt, this.time.elapsed)
    this.measure.update()
    this.trigger('frame', dt)
    this.renderer.update()
  }

  setMode(mode: Mode) { this.state.mode = mode; this.trigger('mode', mode) }
  setFloor(floor: StoreyId) { this.state.floor = floor; this.trigger('floor', floor) }

  destroy() {
    this.sizes.off('resize', this._onResize)
    this.time.off('tick', this._onTick)
    this.time.dispose()
    this.sizes.dispose()
    this.measure.dispose()
    this.arrange.dispose()
    this.story.dispose()
    this.player.dispose()
    this.world.dispose()
    this.resources.dispose()
    this.camera.dispose()
    this.renderer.dispose()
    this.scene.clear()
    this.disposeEvents()
    instance = null
  }
}
