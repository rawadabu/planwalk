import * as THREE from 'three'

/**
 * Garden and balcony pieces built from simple solids at real size (metres; x = width, z = depth, y up). They are
 * registered next to the downloaded models, so Furniture places, instances and fits them the same way.
 */
type Mats = Record<string, THREE.Material>
const box = (g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y + h / 2, z); mesh.rotation.x = rx; g.add(mesh); return mesh
}
const cyl = (g: THREE.Group, m: THREE.Material, r1: number, r2: number, h: number, x: number, y: number, z: number, seg = 16) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); mesh.position.set(x, y + h / 2, z); g.add(mesh); return mesh
}
const blob = (g: THREE.Group, m: THREE.Material, r: number, x: number, y: number, z: number, sy = 1) => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m); mesh.position.set(x, y, z); mesh.scale.y = sy; g.add(mesh); return mesh
}

const BUILD: Record<string, (M: Mats) => THREE.Group> = {
  gardenLounger: M => {
    const g = new THREE.Group()
    box(g, M.oak, .7, .06, 1.95, 0, .26, 0)
    for (const [x, z] of [[-.3, -.9], [.3, -.9], [-.3, .9], [.3, .9]]) box(g, M.oak, .06, .26, .06, x, 0, z)
    box(g, M.linen, .62, .09, 1.3, 0, .32, .3)                             // mattress
    box(g, M.oak, .7, .05, .68, 0, .5, -.68, -.6)                           // raised back
    box(g, M.linen, .62, .08, .62, 0, .55, -.66, -.6)
    return g
  },
  gardenParasol: M => {
    const g = new THREE.Group()
    cyl(g, M.stone, .3, .34, .09, 0, 0, 0, 20)
    cyl(g, M.steel, .028, .028, 2.42, 0, .05, 0, 10)
    cyl(g, M.linen, .02, 1.4, .42, 0, 2.06, 0, 8)                           // canopy
    cyl(g, M.linen, 1.4, 1.4, .05, 0, 2.02, 0, 8)                           // valance
    return g
  },
  gardenSofa: M => {
    const g = new THREE.Group()
    box(g, M.oak, 1.9, .26, .85, 0, .06, 0)
    box(g, M.oak, 1.9, .5, .1, 0, .25, -.375); box(g, M.oak, .1, .34, .85, -.9, .25, 0); box(g, M.oak, .1, .34, .85, .9, .25, 0)
    for (const x of [-.57, 0, .57]) { box(g, M.fabric, .54, .13, .66, x, .32, .05); box(g, M.fabric, .54, .34, .13, x, .42, -.27, -.18) }
    return g
  },
  gardenTable: M => {
    const g = new THREE.Group()
    box(g, M.oak, 1.8, .045, .9, 0, .705, 0)
    for (const [x, z] of [[-.8, -.36], [.8, -.36], [-.8, .36], [.8, .36]]) box(g, M.metal, .05, .705, .05, x, 0, z)
    box(g, M.metal, 1.6, .04, .04, 0, .66, -.36); box(g, M.metal, 1.6, .04, .04, 0, .66, .36)
    return g
  },
  gardenChair: M => {
    const g = new THREE.Group()
    for (const [x, z] of [[-.23, -.24], [.23, -.24], [-.23, .24], [.23, .24]]) box(g, M.metal, .035, z < 0 ? .85 : .44, .035, x, 0, z)
    box(g, M.oak, .5, .035, .5, 0, .44, 0)
    for (const y of [.58, .68, .78]) box(g, M.oak, .5, .06, .025, 0, y, -.24)
    return g
  },
  gardenPergola: M => {
    const g = new THREE.Group()
    for (const [x, z] of [[-1.68, -1.43], [1.68, -1.43], [-1.68, 1.43], [1.68, 1.43]]) box(g, M.walnut, .14, 2.4, .14, x, 0, z)
    box(g, M.walnut, 3.5, .16, .1, 0, 2.4, -1.43); box(g, M.walnut, 3.5, .16, .1, 0, 2.4, 1.43)
    for (let i = 0; i < 9; i++) box(g, M.walnut, .06, .12, 3.0, -1.6 + i * .4, 2.48, 0)
    return g
  },
  gardenGrill: M => {
    const g = new THREE.Group()
    box(g, M.metal, 1.2, .86, .6, 0, 0, 0)
    box(g, M.steel, 1.22, .03, .62, 0, .86, 0)
    box(g, M.steel, .7, .22, .5, -.2, .89, 0)                               // lid
    box(g, M.metal, .5, .03, .03, -.2, 1.0, .27)                            // handle
    return g
  },
  gardenPlanter: M => {
    const g = new THREE.Group()
    box(g, M.stone, 1.2, .42, .45, 0, 0, 0); box(g, M.soil, 1.12, .02, .37, 0, .41, 0)
    for (const [x, r] of [[-.4, .2], [-.12, .24], [.18, .21], [.43, .18]]) blob(g, M.leaf, r, x, .42 + r * .8, 0, 1.1)
    return g
  },
  gardenHedge: M => { const g = new THREE.Group(); box(g, M.hedge, 2.0, 1.3, .55, 0, 0, 0); return g },
  gardenShrub: M => {
    const g = new THREE.Group()
    blob(g, M.leaf, .42, 0, .42, 0); blob(g, M.leaf, .3, .22, .52, .12); blob(g, M.leaf, .28, -.22, .34, -.1)
    return g
  },
}
// what makes a room look lived in: soft furnishings, light and storage
Object.assign(BUILD, {
  homeRug: (M: Mats) => { const g = new THREE.Group(); box(g, M.rug, 3.0, .018, 2.0, 0, 0, 0); return g },
  homeTvUnit: (M: Mats) => {
    const g = new THREE.Group()
    box(g, M.oak, 2.0, .34, .4, 0, .12, 0); box(g, M.metal, 1.9, .12, .36, 0, 0, 0)                      // a low console on a recessed plinth
    box(g, M.blackGlass, 1.45, .82, .035, 0, .72, -.17)                                                  // the screen, on the wall
    box(g, M.ceramic, .16, .2, .16, -.78, .46, .02); box(g, M.walnut, .3, .05, .2, .7, .46, .02)
    return g
  },
  homeShelf: (M: Mats) => {
    const g = new THREE.Group()
    box(g, M.oak, .03, 1.9, .32, -.535, 0, 0); box(g, M.oak, .03, 1.9, .32, .535, 0, 0); box(g, M.oak, 1.1, .02, .3, 0, 0, -.005)
    for (let i = 0; i <= 5; i++) box(g, M.oak, 1.04, .025, .3, 0, .04 + i * .37, 0)
    // books and a few objects
    const tone = [M.fabricD, M.linen, M.walnut, M.fabric, M.metal]
    for (let i = 0; i < 5; i++) for (let k = 0; k < 6; k++) { if ((i * 7 + k * 3) % 5 === 0) continue; const hgt = .2 + ((i * 3 + k) % 4) * .03; box(g, tone[(i + k) % tone.length], .11, hgt, .2, -.42 + k * .165, .065 + i * .37, -.02) }
    return g
  },
  homeConsole: (M: Mats) => {
    const g = new THREE.Group()
    box(g, M.oak, 1.2, .04, .35, 0, .78, 0)
    for (const x of [-.56, .56]) { box(g, M.metal, .03, .78, .03, x, 0, -.15); box(g, M.metal, .03, .78, .03, x, 0, .15) }
    box(g, M.metal, 1.12, .02, .3, 0, .2, 0)
    cyl(g, M.ceramic, .07, .09, .22, -.35, .82, 0, 12); blob(g, M.leaf, .13, -.35, 1.13, 0)
    return g
  },
  homeFloorLamp: (M: Mats) => {
    const g = new THREE.Group()
    cyl(g, M.metal, .16, .17, .025, 0, 0, 0, 20); cyl(g, M.metal, .012, .012, 1.3, 0, .02, 0, 8)
    cyl(g, M.linen, .16, .2, .28, 0, 1.3, 0, 20); cyl(g, M.lightDisc, .1, .1, .01, 0, 1.31, 0, 12)
    return g
  },
  homePendant: (M: Mats) => {
    const g = new THREE.Group()
    cyl(g, M.metal, .004, .004, .78, 0, .32, 0, 6)                                                       // the cord, up to the ceiling
    cyl(g, M.metal, .05, .18, .3, 0, .02, 0, 20); cyl(g, M.lightDisc, .15, .15, .012, 0, .012, 0, 16)    // the shade and its light
    return g
  },
})
export const GARDEN_MODELS = Object.keys(BUILD)

/** Add the built-in pieces to the loaded models (once per viewer). */
export function registerGarden(items: Record<string, unknown>, M: Mats) {
  for (const [name, build] of Object.entries(BUILD)) {
    if (items[name]) continue
    const g = build(M); g.name = name
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.receiveShadow = true } })
    items[name] = g
  }
}
