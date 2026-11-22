import EventEmitter from './EventEmitter'

// Viewport size + capped pixel ratio. Emits 'resize' (ResizeObserver on the canvas, debounced to one per frame).
export default class Sizes extends EventEmitter {
  [key: string]: any
  constructor(canvas) {
    super()
    this.canvas = canvas
    this.read()
    this._raf = 0
    this._observer = new ResizeObserver(() => {
      cancelAnimationFrame(this._raf)
      this._raf = requestAnimationFrame(() => { this.read(); this.trigger('resize') })
    })
    this._observer.observe(canvas)
  }
  read() {
    this.width = this.canvas.clientWidth || innerWidth
    this.height = this.canvas.clientHeight || innerHeight
    this.maxPixelRatio = Math.min(window.devicePixelRatio, 2)
  }
  dispose() { this._observer.disconnect(); cancelAnimationFrame(this._raf); this.disposeEvents() }
}
