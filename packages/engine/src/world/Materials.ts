import * as THREE from 'three'

// Shared PBR materials. Procedural canvas textures (porcelain floor at true 120×60 cm scale, quartz) are generated here;
// photo textures come from Resources. One instance per material, reused by every mesh → few shader programs.
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

export default class Materials {
  [key: string]: any
  constructor(resources, maxAniso) {
    const t = resources.items
    this.textures = []
    const canvasTex = (w, h, draw, srgb = false) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
      const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = maxAniso
      if (srgb) tx.colorSpace = THREE.SRGBColorSpace
      this.textures.push(tx); return tx
    }
    this.canvasTex = canvasTex
    this.FLOOR_TILE_M = 2.4
    const FT = 2048, grout = 3
    const floorMap = canvasTex(FT, FT, (g, w, h) => {
      const tw = w / 2, th = h / 4
      for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
        const x = i * tw, y = j * th, s = 224 + rnd() * 7
        const grd = g.createLinearGradient(x, y, x + tw, y + th)
        grd.addColorStop(0, `rgb(${s},${s - 13},${s - 33})`); grd.addColorStop(1, `rgb(${s - 7},${s - 20},${s - 40})`)
        g.fillStyle = grd; g.fillRect(x, y, tw, th)
        for (let n = 0; n < 2500; n++) { g.fillStyle = `rgba(120,110,95,${rnd() * .04})`; g.fillRect(x + rnd() * tw, y + rnd() * th, 2, 2) }
        g.save(); g.beginPath(); g.rect(x, y, tw, th); g.clip()
        for (let k = 0; k < 3; k++) { g.beginPath(); let px = x + rnd() * tw, py = y; g.moveTo(px, py); while (py < y + th) { px += (rnd() - .5) * 60; py += 20 + rnd() * 40; g.lineTo(px, py) } g.strokeStyle = `rgba(150,140,128,${.05 + rnd() * .06})`; g.lineWidth = 1 + rnd() * 3; g.stroke() }
        g.restore()
      }
      g.fillStyle = '#cbbfac'
      for (let i = 0; i <= 2; i++) g.fillRect(i * tw - grout / 2, 0, grout, h)
      for (let j = 0; j <= 4; j++) g.fillRect(0, j * th - grout / 2, w, grout)
    }, true)
    const floorRough = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = 'rgb(70,70,70)'; g.fillRect(0, 0, w, h)
      for (let n = 0; n < 400; n++) { const v = 55 + rnd() * 40; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 40, 0, 7); g.fill() }
      g.fillStyle = 'rgb(235,235,235)'
      for (let i = 0; i <= 2; i++) g.fillRect(i * w / 2 - 1, 0, 2, h)
      for (let j = 0; j <= 4; j++) g.fillRect(0, j * h / 4 - 1, w, 2)
    })
    const quartzMap = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#e8dcc8'; g.fillRect(0, 0, w, h)
      for (let n = 0; n < 9000; n++) { g.fillStyle = `rgba(110,100,90,${rnd() * .05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
      for (let k = 0; k < 6; k++) { g.beginPath(); let x = rnd() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (rnd() - .5) * 90; y += 30 + rnd() * 50; g.lineTo(x, y) } g.strokeStyle = `rgba(140,132,122,${.12 + rnd() * .12})`; g.lineWidth = 1 + rnd() * 2.5; g.stroke() }
    }, true)
    quartzMap.repeat.set(.5, .5)
    if (t.linenNor) t.linenNor.repeat.set(3, 3)

    const std = o => new THREE.MeshStandardMaterial(o)
    this.list = {
      floor: std({ map: floorMap, roughnessMap: floorRough, roughness: 1 }),
      wall: std({ color: 0xeee2d0, roughness: .95, normalMap: t.plasterNor, normalScale: new THREE.Vector2(.18, .18) }),
      ceil: std({ color: 0xf2e9dc, roughness: 1 }),
      oak: std({ map: t.oakDiff, roughnessMap: t.oakRough, normalMap: t.oakNor, color: 0xf0e2cf, roughness: 1, normalScale: new THREE.Vector2(.5, .5) }),
      walnut: std({ map: t.walnutDiff, roughnessMap: t.walnutRough, normalMap: t.walnutNor, color: 0xc28d66, roughness: 1 }),
      lacquer: std({ color: 0xebe6de, roughness: .45 }),
      quartz: std({ map: quartzMap, roughness: .2 }),
      fabric: std({ color: 0xcdbfa8, normalMap: t.linenNor, roughness: .95 }),
      fabricD: std({ color: 0x8c8172, normalMap: t.linenNor, roughness: 1 }),
      linen: std({ color: 0xf4f0e8, roughness: 1 }),
      rug: std({ map: t.rugDiff, normalMap: t.rugNor, color: 0xe8dfd2, roughness: 1 }),
      metal: std({ color: 0x1c1d1f, roughness: .38, metalness: .7 }),
      ceramic: std({ color: 0xfbfbf9, roughness: .12 }),
      steel: std({ color: 0xc6c9cc, roughness: .28, metalness: .85 }),
      blackGlass: std({ color: 0x0c0c0d, roughness: .08, metalness: .2 }),
      plant: std({ color: 0x55703e, roughness: .8 }),
      soil: std({ color: 0x3b2e24, roughness: 1 }),
      stone: std({ color: 0xd8d0c3, roughness: .85 }),
      deck: std({ color: 0xc9bca9, roughness: .8 }),
      paver: std({ color: 0xb7aea1, roughness: .9 }),
      grass: std({ color: 0x8aa863, roughness: 1 }),
      asphalt: std({ color: 0x3d3f43, roughness: .95 }),
      plasterWarm: std({ color: 0xe3d4bd, roughness: .95 }),
      plasterGrey: std({ color: 0xcfcbc4, roughness: .95 }),
      leaf: std({ color: 0x4d6b38, roughness: .9 }),
      // glass: 'simple' is a cheap transparent pane; 'physical' uses transmission (one extra scene render per frame)
      glassSimple: new THREE.MeshPhysicalMaterial({ color: 0xdfeef6, transparent: true, opacity: .14, roughness: .03, metalness: 0, envMapIntensity: 1.2, depthWrite: false }),
      glassPhysical: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: .02, thickness: .01, ior: 1.5 }),
      railGlass: new THREE.MeshPhysicalMaterial({ color: 0xeaf4f4, transparent: true, opacity: .2, roughness: .05, depthWrite: false }),
      flame: std({ color: 0x000000, emissive: 0xff7a2a, emissiveIntensity: 6 }),
      lightDisc: std({ color: 0xffffff, emissive: 0xfff1dc, emissiveIntensity: .4 }),
      ringLed: std({ color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 2 }),
      ledStrip: std({ color: 0x000000, emissive: 0xffc98f, emissiveIntensity: 3.5 }),
    }
    this.list.glass = this.list.glassSimple
    this.uvSize = { floor: this.FLOOR_TILE_M, wall: 2, oak: 1.2, walnut: 1, quartz: 2.4, rug: 1.2, fabric: .6, fabricD: .6, deck: 1 }
    this.shadowless = new Set(['glass', 'railGlass', 'lightDisc', 'ringLed', 'ledStrip', 'flame', 'rug'])
  }
  get(key) { return this.list[key] }
  // A material for a design look, derived from the base material of the surface it replaces (same UV scale).
  // Cached per (surface, look), so switching back and forth costs nothing.
  lookMaterial(baseKey: string, look: { color: string; texture?: string; roughness: number; metalness?: number }) {
    this._looks ??= new Map()
    const id = baseKey + JSON.stringify(look)
    if (this._looks.has(id)) return this._looks.get(id)
    const base = this.list[baseKey], m = base.clone()
    const L = this.list, uv = this.uvSize, TEX = {
      oak: [L.oak.map, L.oak.roughnessMap, L.oak.normalMap, uv.oak], walnut: [L.walnut.map, L.walnut.roughnessMap, L.walnut.normalMap, uv.walnut],
      tile: [L.floor.map, L.floor.roughnessMap, null, this.FLOOR_TILE_M], quartz: [L.quartz.map, null, null, uv.quartz], plaster: [null, null, L.wall.normalMap, uv.wall],
    }
    const t = look.texture ? TEX[look.texture] : null
    // textures are drawn at their own real size whatever surface they land on
    const scaled = tex => { if (!tex) return null; const k = (uv[baseKey] || 1) / (t[3] || 1); if (Math.abs(k - 1) < 1e-3) return tex; const c = tex.clone(); c.repeat.multiplyScalar(k); c.needsUpdate = true; this.textures.push(c); return c }
    m.map = t ? scaled(t[0]) : null
    m.roughnessMap = t ? scaled(t[1]) : null
    m.normalMap = t ? scaled(t[2]) : null
    m.color.set(look.color); m.roughness = look.roughness; m.metalness = look.metalness ?? 0
    m.needsUpdate = true
    this._looks.set(id, m)
    return m
  }
  // "Make it yours": live finish options. Cabinets = the walnut joinery, floor = the floor finish.
  setFinish(slot: 'cabinets' | 'floor', option: string) {
    const mat = this.list[slot === 'cabinets' ? 'walnut' : 'floor']
    if (!this._orig) this._orig = {}
    if (!this._orig[slot]) this._orig[slot] = { map: mat.map, roughnessMap: mat.roughnessMap, normalMap: mat.normalMap, color: mat.color.getHex(), roughness: mat.roughness }
    const o = this._orig[slot], oak = this.list.oak
    const looks = {
      cabinets: { walnut: o, oak: { map: oak.map, roughnessMap: oak.roughnessMap, normalMap: oak.normalMap, color: 0xf3e4cf, roughness: 1 },
        navy: { map: null, roughnessMap: null, normalMap: null, color: 0x22355c, roughness: .42 }, sage: { map: null, roughnessMap: null, normalMap: null, color: 0x8b9a80, roughness: .5 },
        white: { map: null, roughnessMap: null, normalMap: null, color: 0xf1ede6, roughness: .4 } },
      floor: { tile: o, oak: { map: oak.map, roughnessMap: oak.roughnessMap, normalMap: null, color: 0xe2cdb0, roughness: 1 },
        concrete: { map: null, roughnessMap: null, normalMap: null, color: 0xb9b4ac, roughness: .75 } },
    }
    const l = looks[slot]?.[option]; if (!l) return false
    const maps = !!mat.map !== !!l.map || !!mat.normalMap !== !!l.normalMap
    Object.assign(mat, { map: l.map, roughnessMap: l.roughnessMap, normalMap: l.normalMap, roughness: l.roughness }); mat.color.setHex(l.color)
    if (maps) mat.needsUpdate = true
    return true
  }
  dispose() {
    for (const m of Object.values(this.list) as any[]) m.dispose()
    this._looks?.forEach(m => m.dispose())
    this.textures.forEach(t => t.dispose())
  }
}
