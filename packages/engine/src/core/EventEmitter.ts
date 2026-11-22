// Minimal typed-ish event emitter: on/off/trigger.
export default class EventEmitter {
  [key: string]: any
  constructor() { this._handlers = new Map() }
  on(name, fn) { (this._handlers.get(name) || this._handlers.set(name, new Set()).get(name)).add(fn); return this }
  off(name, fn) { fn ? this._handlers.get(name)?.delete(fn) : this._handlers.delete(name); return this }
  trigger(name, ...args) { this._handlers.get(name)?.forEach(fn => fn(...args)) }
  disposeEvents() { this._handlers.clear() }
}
