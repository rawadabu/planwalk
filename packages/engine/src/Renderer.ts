import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import Experience from './Experience'

// Quality presets. Performance levers, most expensive first:
//   ao (GTAO, rendered at aoScale of the frame), physical glass (transmission = an extra scene render), bloom, pixel ratio, shadow size.
export const QUALITY = {
  high:   { pr: 2,    shadow: 4096, ao: true,  aoScale: .75, aoSamples: 12, bloom: true,  glass: 'physical' },
  medium: { pr: 1,    shadow: 2048, ao: true,  aoScale: .5,  aoSamples: 8,  bloom: false, glass: 'simple' },
  low:    { pr: .75,  shadow: 1024, ao: false, aoScale: .5,  aoSamples: 4,  bloom: false, glass: 'simple' },
}

export default class Renderer {
  [key: string]: any
  constructor() {
    this.experience = new Experience()
    const { canvas, sizes, scene, camera } = this.experience
    this.instance = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1
    this.instance.shadowMap.enabled = true
    this.instance.info.autoReset = false            // stats() reports the whole frame, not just the last pass
    this.instance.shadowMap.type = THREE.PCFShadowMap
    this.instance.shadowMap.autoUpdate = false     // the house is static: re-render shadows only when the sun moves
    this.shadowDirty = true

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    this.composer = new EffectComposer(this.instance, rt)
    this.renderPass = new RenderPass(scene, camera.instance)
    this.gtao = new GTAOPass(scene, camera.instance, 1, 1)
    this.gtao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.6, thickness: 1.2, scale: 1.25, samples: 8 })
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 })
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .18, .4, 1.4)
    this.output = new OutputPass()
    this.smaa = new SMAAPass()
    for (const p of [this.renderPass, this.gtao, this.bloom, this.output, this.smaa]) this.composer.addPass(p)

    let saved = 'medium'
    try { saved = localStorage.getItem('twq') || 'medium' } catch (e) {}
    this.setQuality(QUALITY[saved] ? saved : 'medium')
  }

  setQuality(name) {
    const q = QUALITY[name], exp = this.experience
    this.preset = q
    exp.state.quality = name
    this.pixelRatio = Math.min(q.pr, exp.sizes.maxPixelRatio)
    this.gtao.enabled = q.ao
    this.gtao.updateGtaoMaterial({ samples: q.aoSamples })
    this.bloom.enabled = q.bloom
    this.resize()
    exp.trigger('quality', name, q)
    this.requestShadowUpdate()
    try { localStorage.setItem('twq', name) } catch (e) {}
  }

  resize() {
    const { width, height } = this.experience.sizes
    this.instance.setPixelRatio(this.pixelRatio)
    this.instance.setSize(width, height, false)
    this.composer.setPixelRatio(this.pixelRatio)
    this.composer.setSize(width, height)
    // AO at a fraction of the frame: the biggest single saving on integrated GPUs
    const s = this.preset.aoScale * this.pixelRatio
    this.gtao.setSize(Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)))
  }

  requestShadowUpdate() { this.shadowDirty = true }

  update() {
    const exp = this.experience
    if (exp.test && !this.renderRequested) return
    this.instance.info.reset()
    if (this.shadowDirty && exp.world.ready) {
      exp.world.prepareShadowPass(true)            // everything that should cast, incl. shadow-only tree canopies
      this.instance.shadowMap.needsUpdate = true
      this.instance.render(exp.scene, exp.camera.instance)   // shadow maps are produced by this render
      exp.world.prepareShadowPass(false)
      this.shadowDirty = false
    }
    this.composer.render()
    if (this.renderRequested) { this.renderRequested = false; (window as any).__twRendered = ((window as any).__twRendered || 0) + 1 }
  }

  dispose() {
    this.composer.passes.forEach(p => p.dispose?.())
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose()
    this.instance.dispose()
  }
}
