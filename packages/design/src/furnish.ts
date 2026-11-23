import type { House, Item } from '@planwalk/house'

/**
 * Furniture and garden pieces a client can place, and the two edits that arrange a home:
 *   item  move / turn / remove a piece the architect's plan already has
 *   add   a new piece from the catalogue, indoors or out (garden, balcony)
 * Like every design edit they are applied to a copy; the plan itself never changes.
 */
export interface Thing {
  id: string
  he: string
  /** 3D model name in the shared library (or one of the engine's built-in garden pieces) */
  model: string
  /** footprint in cm when not turned (width × depth) and height in metres */
  w: number; d: number; h: number
  where: 'in' | 'out'
  /** keep the model's own proportions inside the footprint (plants, trees) instead of filling it */
  uniform?: boolean
  /** height above the floor it hangs or is mounted at, in metres (a pendant lamp, a picture) */
  y?: number
  group: 'seating' | 'tables' | 'bedroom' | 'work' | 'decor' | 'soft' | 'garden' | 'plants'
}
export const THING_GROUPS: Record<Thing['group'], string> = { seating: 'ישיבה', tables: 'שולחנות', bedroom: 'חדר שינה', work: 'עבודה', decor: 'צמחים ונוי', soft: 'שטיחים, תאורה ואחסון', garden: 'ריהוט גן', plants: 'עצים וצמחייה' }
export const THINGS: Thing[] = [
  { id: 'sofa', he: 'ספה', model: 'sofa', w: 220, d: 95, h: .85, where: 'in', group: 'seating' },
  { id: 'armchair', he: 'כורסה', model: 'armchair', w: 85, d: 85, h: .8, where: 'in', group: 'seating' },
  { id: 'dining-chair', he: 'כיסא אוכל', model: 'diningChair', w: 50, d: 52, h: .85, where: 'in', group: 'seating' },
  { id: 'coffee-table', he: 'שולחן סלון', model: 'coffeeTable', w: 110, d: 60, h: .4, where: 'in', group: 'tables' },
  { id: 'side-table', he: 'שולחן צד', model: 'nestingTable', w: 70, d: 55, h: .45, where: 'in', group: 'tables' },
  { id: 'round-table', he: 'שולחן עגול', model: 'roundTable', w: 120, d: 120, h: .75, where: 'in', group: 'tables' },
  { id: 'bed-double', he: 'מיטה זוגית', model: 'bedDouble', w: 160, d: 200, h: 1, where: 'in', group: 'bedroom' },
  { id: 'bed-single', he: 'מיטת יחיד', model: 'bedSingle', w: 90, d: 200, h: .9, where: 'in', group: 'bedroom' },
  { id: 'nightstand', he: 'שידת לילה', model: 'nightstand', w: 50, d: 38, h: .52, where: 'in', group: 'bedroom' },
  { id: 'desk', he: 'שולחן עבודה', model: 'desk', w: 140, d: 65, h: .75, where: 'in', group: 'work' },
  { id: 'desk-chair', he: 'כיסא עבודה', model: 'deskChair', w: 60, d: 60, h: .95, where: 'in', group: 'work' },
  { id: 'plant', he: 'עציץ', model: 'succulent', w: 40, d: 40, h: .55, uniform: true, where: 'in', group: 'decor' },
  { id: 'olive-pot', he: 'עץ זית בעציץ', model: 'oliveTree', w: 105, d: 80, h: 1.9, uniform: true, where: 'in', group: 'decor' },
  { id: 'vase', he: 'אגרטל', model: 'vase', w: 30, d: 30, h: .55, uniform: true, where: 'in', group: 'decor' },
  // built into the viewer (simple, real-size): what makes a room look lived in
  { id: 'rug-large', he: 'שטיח גדול', model: 'homeRug', w: 300, d: 200, h: .02, where: 'in', group: 'soft' },
  { id: 'rug-small', he: 'שטיח קטן', model: 'homeRug', w: 200, d: 140, h: .02, where: 'in', group: 'soft' },
  { id: 'tv-unit', he: 'מזנון וטלוויזיה', model: 'homeTvUnit', w: 200, d: 42, h: 1.55, where: 'in', group: 'soft' },
  { id: 'bookshelf', he: 'כוננית ספרים', model: 'homeShelf', w: 110, d: 32, h: 1.9, where: 'in', group: 'soft' },
  { id: 'console', he: 'קונסולה', model: 'homeConsole', w: 120, d: 35, h: .82, where: 'in', group: 'soft' },
  { id: 'floor-lamp', he: 'מנורת עמידה', model: 'homeFloorLamp', w: 40, d: 40, h: 1.6, where: 'in', group: 'soft' },
  { id: 'pendant', he: 'מנורת תלייה', model: 'homePendant', w: 36, d: 36, h: 1.1, y: 1.7, where: 'in', group: 'soft' },
  // outdoors: built into the viewer (simple, real-size), plus the neighbourhood's trees
  { id: 'lounger', he: 'מיטת שיזוף', model: 'gardenLounger', w: 70, d: 195, h: .8, where: 'out', group: 'garden' },
  { id: 'parasol', he: 'שמשייה', model: 'gardenParasol', w: 280, d: 280, h: 2.5, where: 'out', group: 'garden' },
  { id: 'garden-sofa', he: 'ספת גן', model: 'gardenSofa', w: 190, d: 85, h: .75, where: 'out', group: 'garden' },
  { id: 'garden-table', he: 'שולחן גן', model: 'gardenTable', w: 180, d: 90, h: .75, where: 'out', group: 'garden' },
  { id: 'garden-chair', he: 'כיסא גן', model: 'gardenChair', w: 55, d: 58, h: .85, where: 'out', group: 'garden' },
  { id: 'pergola', he: 'פרגולה', model: 'gardenPergola', w: 350, d: 300, h: 2.6, where: 'out', group: 'garden' },
  { id: 'bbq', he: 'גריל', model: 'gardenGrill', w: 120, d: 60, h: 1.1, where: 'out', group: 'garden' },
  { id: 'planter', he: 'אדנית', model: 'gardenPlanter', w: 120, d: 45, h: .8, where: 'out', group: 'plants' },
  { id: 'hedge', he: 'גדר חיה', model: 'gardenHedge', w: 200, d: 55, h: 1.3, where: 'out', group: 'plants' },
  { id: 'shrub', he: 'שיח', model: 'gardenShrub', w: 90, d: 90, h: .9, where: 'out', group: 'plants' },
  { id: 'tree-olive', he: 'עץ זית', model: 'nbTreeOlive', w: 450, d: 450, h: 5, uniform: true, where: 'out', group: 'plants' },
  { id: 'tree-ficus', he: 'עץ פיקוס', model: 'nbTreeFicus', w: 520, d: 520, h: 6.5, uniform: true, where: 'out', group: 'plants' },
  { id: 'tree-cypress', he: 'ברוש', model: 'nbTreeCypress', w: 220, d: 220, h: 7.5, uniform: true, where: 'out', group: 'plants' },
]
const BY_ID = new Map(THINGS.map(t => [t.id, t])), BY_MODEL = new Map(THINGS.map(t => [t.model, t]))
export const thing = (id: string) => BY_ID.get(id)
/** What a piece of the plan is called (by its 3D model). */
const OTHER: Record<string, string> = { island: 'אי מטבח', toilet: 'אסלה', bathtub: 'אמבטיה', vanity: 'ארון אמבטיה' }
export const pieceName = (model: string) => BY_MODEL.get(model)?.he ?? OTHER[model] ?? 'רהיט'
/** Pieces that are plumbed in or built in stay where the architect drew them. */
export const FIXED = new Set(['toilet', 'bathtub', 'vanity', 'island'])

export interface ItemEdit { k: 'item'; floor: 0 | 1 | 2; ref: string; dx: number; dy: number; turn?: number; remove?: boolean }
export interface AddEdit { k: 'add'; floor: 0 | 1 | 2; id: string; thing: string; x: number; y: number; turn: number; out?: boolean }
type Model = Extract<Item, { k: 'model' }>

/** A piece of the plan, named so that an edit still finds it later: its model and where its centre is on the plan. */
export const itemRef = (it: Model) => `${it.name}-${Math.round((it.r[0] + it.r[2]) / 2)}-${Math.round((it.r[1] + it.r[3]) / 2)}`
const quarter = (t = 0) => ((Math.round(t) % 4) + 4) % 4

/** Turn a footprint by quarter turns around its centre. */
function turned(r: number[], q: number): [number, number, number, number] {
  if (q % 2 === 0) return [r[0], r[1], r[2], r[3]]
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, w = r[2] - r[0], h = r[3] - r[1]
  return [cx - h / 2, cy - w / 2, cx + h / 2, cy + w / 2]
}

export interface FurnishIssue { key: string; level: 'error' | 'warning'; message: string }
/**
 * Apply furniture edits to a house (in place: the caller passes its own copy). `keys[i]` is the edit key that addresses
 * house.items[i] afterwards — for every movable piece, edited or not — so a click in 3D can be turned into an edit.
 */
export function applyFurniture(house: House, edits: Array<[string, ItemEdit | AddEdit]>, pxPerCm: number): { keys: Array<string | null>; issues: FurnishIssue[] } {
  const issues: FurnishIssue[] = []
  const byRef = new Map<string, ItemEdit & { key: string }>()
  for (const [key, e] of edits) if (e.k === 'item') byRef.set(`${e.floor}|${e.ref}`, { ...e, key })
  const used = new Set<string>(), items: Item[] = [], keys: Array<string | null> = []
  for (const it of house.items) {
    if (it.k !== 'model') { items.push(it); keys.push(null); continue }
    const ref = itemRef(it), key = `item:f${it.f}.${ref}`, e = byRef.get(`${it.f}|${ref}`)
    if (FIXED.has(it.name)) { items.push(it); keys.push(null); continue }
    if (!e) { items.push(it); keys.push(key); continue }
    used.add(`${it.f}|${ref}`)
    if (e.remove) continue
    const q = quarter(e.turn), r = turned(it.r.map((v, i) => v + (i % 2 ? e.dy : e.dx)), q)
    items.push({ ...it, r, rot: it.rot + q * Math.PI / 2 }); keys.push(key)
  }
  for (const [k, e] of byRef) if (!used.has(k)) issues.push({ key: e.key, level: 'error', message: 'This piece is not in the plan any more' })
  for (const [key, e] of edits) {
    if (e.k !== 'add') continue
    const t = thing(e.thing)
    if (!t) { issues.push({ key, level: 'error', message: `Unknown piece "${e.thing}"` }); continue }
    const w = t.w * pxPerCm, d = t.d * pxPerCm, q = quarter(e.turn)
    const r = turned([e.x - w / 2, e.y - d / 2, e.x + w / 2, e.y + d / 2], q)
    items.push({ k: 'model', f: e.floor, name: t.model, r, h: t.h, rot: q * Math.PI / 2, ...(t.uniform ? { uniform: true } : {}), ...(t.y ? { y: t.y } : {}), ...(e.out ? { layer: 'outdoor' as const } : {}) })
    keys.push(key)
  }
  house.items = items
  return { keys, issues }
}
