import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import EventEmitter from './EventEmitter'

// Loads every source; models are decoded in a Web Worker and parsed in memory (no WebAssembly, no data:/blob: fetches,
// which strict page policies block). Emits 'progress' (loaded, total) and 'ready'.
export default class Resources extends EventEmitter {
  [key: string]: any
  constructor(sources, renderer, workerUrl?, siteSources: any[] = []) {
    super()
    this.workerUrl = workerUrl
    this.siteSources = siteSources          // extra models, loaded only if the house has surroundings
    this.sources = sources
    this.items = {} as Record<string, any>
    this.loaded = 0
    this.total = sources.length
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    this.textureLoader = new THREE.TextureLoader()
    // GLTFLoader would decode embedded images with createImageBitmap(fetch(blob:)); force <img> decoding instead.
    try { (self as any).createImageBitmap = undefined } catch (e) { /* read-only in some browsers: harmless */ }
    this.gltf = new GLTFLoader()
    this._jobs = new Map()
    this._jobId = 0
    this.worker = this._makeWorker()
    this.startLoading()
  }
  _makeWorker() {
    try {
      // Vite bundles this worker from the import.meta.url pattern; an explicit URL can override it
      const w = this.workerUrl ? new Worker(this.workerUrl, { type: 'module' }) : new Worker(new URL('../workers/decode.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = ({ data }) => { const job = this._jobs.get(data.id); this._jobs.delete(data.id); data.error ? job.reject(new Error(data.error)) : job.resolve(data.buffer) }
      return w
    } catch (e) { return null }   // fall back to main-thread decoding
  }
  _decode(url) {
    if (!this.worker) return fetch(url).then(r => r.json()).then(({ glb }) => Uint8Array.from(atob(glb), c => c.charCodeAt(0)).buffer)
    return new Promise((resolve, reject) => { const id = ++this._jobId; this._jobs.set(id, { resolve, reject }); this.worker.postMessage({ id, url: new URL(url, location.href).href }) })
  }
  startLoading() { for (const s of this.sources) this._load(s) }
  _load(s) {
    if (s.type === 'texture') {
      this.textureLoader.load(s.path, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.anisotropy = this.maxAniso
        if (s.srgb) t.colorSpace = THREE.SRGBColorSpace
        if (s.equirect) t.mapping = THREE.EquirectangularReflectionMapping
        this._done(s, t)
      }, undefined, () => this._done(s, null))
    } else if (s.type === 'json') {
      fetch(s.path).then(r => { if (!r.ok) throw new Error(r.status + ' ' + s.path); return r.json() })
        .then(j => this._done(s, j)).catch(e => { console.error('json failed', s.path, e); this._done(s, null) })
    } else if (s.type === 'model') {
      this._decode(s.path)
        .then(buf => new Promise((res, rej) => this.gltf.parse(buf, '', res, rej)))
        .then((g: any) => this._done(s, g.scene))
        .catch(e => { console.warn('model failed', s.name, e); this._done(s, null) })
    }
  }
  _done(source, item) {
    this.items[source.name] = item
    // a house with a site brings its neighbourhood kit along
    if (source.name === 'house' && item?.site && this.siteSources.length) { const extra = this.siteSources; this.siteSources = []; this.total += extra.length; for (const s of extra) this._load(s) }
    this.loaded++
    this.trigger('progress', this.loaded, this.total)
    if (this.loaded === this.total) { this.worker?.terminate(); this.worker = null; this.trigger('ready') }
  }
  dispose() {
    this.worker?.terminate()
    for (const item of Object.values(this.items) as any[]) {
      if (!item) continue
      if (item.isTexture) item.dispose()
      else item.traverse?.(o => { if (o.isMesh) { o.geometry.dispose(); ([] as any[]).concat(o.material).forEach(m => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose() }) } })
    }
    this.items = {} as Record<string, any>
    this.disposeEvents()
  }
}
