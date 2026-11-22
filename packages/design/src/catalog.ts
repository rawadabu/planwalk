/**
 * Finish catalogue: everything a surface or element can be finished with.
 * `look` is what the 3D engine draws; prices arrive with sheet A-06.
 * Names are bilingual because buyers see Hebrew and the carpenter PDF may be either.
 */
export type Category = 'paint' | 'wood' | 'lacquer' | 'tile' | 'stone' | 'concrete' | 'metal'
export type Texture = 'oak' | 'walnut' | 'tile' | 'quartz' | 'plaster'
export interface Look { color: string; texture?: Texture; roughness: number; metalness?: number }
export interface Finish { id: string; category: Category; he: string; en: string; look: Look }

const f = (id: string, category: Category, he: string, en: string, look: Look): Finish => ({ id, category, he, en, look })

export const FINISHES: Finish[] = [
  // wall and ceiling paint (matt emulsion)
  f('paint-warm-white', 'paint', 'לבן חם', 'Warm white', { color: '#eee2d0', texture: 'plaster', roughness: .95 }),
  f('paint-pure-white', 'paint', 'לבן נקי', 'Pure white', { color: '#f5f4f0', texture: 'plaster', roughness: .95 }),
  f('paint-greige', 'paint', 'גרייז׳', 'Greige', { color: '#cfc6b8', texture: 'plaster', roughness: .95 }),
  f('paint-sage', 'paint', 'ירוק מרווה', 'Sage green', { color: '#a9b49b', texture: 'plaster', roughness: .95 }),
  f('paint-clay', 'paint', 'טרקוטה רכה', 'Soft clay', { color: '#c99a7d', texture: 'plaster', roughness: .95 }),
  f('paint-mist-blue', 'paint', 'כחול ערפל', 'Mist blue', { color: '#aebccb', texture: 'plaster', roughness: .95 }),
  f('paint-charcoal', 'paint', 'פחם', 'Charcoal', { color: '#4a4b4d', texture: 'plaster', roughness: .9 }),
  // wood (veneer for joinery, engineered boards for floors)
  f('wood-walnut', 'wood', 'אגוז אמריקאי', 'American walnut', { color: '#c28d66', texture: 'walnut', roughness: 1 }),
  f('wood-oak', 'wood', 'אלון טבעי', 'Natural oak', { color: '#f0e2cf', texture: 'oak', roughness: 1 }),
  f('wood-oak-smoked', 'wood', 'אלון מעושן', 'Smoked oak', { color: '#9c8066', texture: 'oak', roughness: 1 }),
  f('wood-oak-white', 'wood', 'אלון מולבן', 'White-washed oak', { color: '#f7efe4', texture: 'oak', roughness: 1 }),
  // lacquer (joinery)
  f('lacquer-navy', 'lacquer', 'כחול נייבי', 'Navy lacquer', { color: '#22355c', roughness: .42 }),
  f('lacquer-sage', 'lacquer', 'מרווה מט', 'Matt sage', { color: '#8b9a80', roughness: .5 }),
  f('lacquer-white', 'lacquer', 'לבן מט', 'Matt white', { color: '#f1ede6', roughness: .45 }),
  f('lacquer-black', 'lacquer', 'שחור מט', 'Matt black', { color: '#232426', roughness: .5 }),
  // floor tiles (porcelain)
  f('tile-light', 'tile', 'פורצלן בהיר 120×60', 'Light porcelain 120×60', { color: '#ffffff', texture: 'tile', roughness: 1 }),
  f('tile-warm-grey', 'tile', 'פורצלן אפור חם 120×60', 'Warm grey porcelain 120×60', { color: '#cfc8bd', texture: 'tile', roughness: 1 }),
  f('tile-dark', 'tile', 'פורצלן כהה 120×60', 'Dark porcelain 120×60', { color: '#7b7670', texture: 'tile', roughness: .9 }),
  // stone (worktops, cladding)
  f('stone-quartz-white', 'stone', 'קוורץ לבן', 'White quartz', { color: '#ffffff', texture: 'quartz', roughness: .2 }),
  f('stone-granite-black', 'stone', 'גרניט שחור', 'Black granite', { color: '#3b3a39', texture: 'quartz', roughness: .25 }),
  f('stone-travertine', 'stone', 'טרוורטין', 'Travertine', { color: '#e3d3bb', texture: 'quartz', roughness: .55 }),
  // concrete
  f('concrete-polished', 'concrete', 'בטון מוחלק', 'Polished concrete', { color: '#b9b4ac', roughness: .7 }),
  // aluminium window frames
  f('metal-black', 'metal', 'אלומיניום שחור', 'Black aluminium', { color: '#1c1d1f', roughness: .38, metalness: .7 }),
  f('metal-anthracite', 'metal', 'אנתרציט', 'Anthracite aluminium', { color: '#3d4044', roughness: .4, metalness: .6 }),
  f('metal-white', 'metal', 'אלומיניום לבן', 'White aluminium', { color: '#eeeeec', roughness: .4, metalness: .3 }),
  f('metal-bronze', 'metal', 'ברונזה', 'Bronze aluminium', { color: '#6b5440', roughness: .4, metalness: .7 }),
]
const BY_ID = new Map(FINISHES.map(x => [x.id, x]))
export const finish = (id: string) => BY_ID.get(id)

/** Parts of the house a design can finish, and which categories make sense on each. */
export const PARTS = {
  floor: { he: 'רצפה', en: 'Floor', allowed: ['tile', 'wood', 'stone', 'concrete'] },
  walls: { he: 'קירות', en: 'Walls', allowed: ['paint', 'tile', 'stone'] },
  ceiling: { he: 'תקרה', en: 'Ceiling', allowed: ['paint'] },
  joinery: { he: 'נגרות', en: 'Joinery', allowed: ['wood', 'lacquer'] },
  worktop: { he: 'משטח', en: 'Worktop', allowed: ['stone'] },
  frames: { he: 'מסגרות חלונות', en: 'Window frames', allowed: ['metal'] },
} as const satisfies Record<string, { he: string; en: string; allowed: readonly Category[] }>
export type Part = keyof typeof PARTS
export const PART_IDS = Object.keys(PARTS) as Part[]

/** What the architect's base model uses today, per part (what "no change" looks like). */
export const BASE: Record<Part, string> = {
  floor: 'tile-light', walls: 'paint-warm-white', ceiling: 'paint-pure-white', joinery: 'wood-walnut', worktop: 'stone-quartz-white', frames: 'metal-black',
}
export const finishesFor = (part: Part) => FINISHES.filter(x => (PARTS[part].allowed as readonly string[]).includes(x.category))
