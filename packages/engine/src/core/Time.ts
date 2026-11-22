import EventEmitter from './EventEmitter'

// requestAnimationFrame loop. Emits 'tick' with { delta (s, clamped), elapsed (s) }.
export default class Time extends EventEmitter {
  [key: string]: any
  constructor() {
    super()
    this.start = performance.now()
    this.current = this.start
    this.elapsed = 0
    this.delta = 1 / 60
    this._running = true
    this._raf = requestAnimationFrame(t => this.tick(t))
  }
  tick(now) {
    if (!this._running) return
    this.delta = Math.min(0.05, (now - this.current) / 1000)
    this.current = now
    this.elapsed = (now - this.start) / 1000
    this.trigger('tick', this)
    this._raf = requestAnimationFrame(t => this.tick(t))
  }
  dispose() { this._running = false; cancelAnimationFrame(this._raf); this.disposeEvents() }
}
