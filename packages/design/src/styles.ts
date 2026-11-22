import type { Part } from './catalog'
import type { Design } from './schema'

/**
 * Ready-made looks (sheet A-12): one tap sets every finish in the house. Built only from catalogue finishes,
 * so each style is priced, buildable and goes into the carpenter's drawings like any other choice.
 */
export interface Style { id: string; he: string; en: string; blurb: string; swatch: string[]; finishes: Record<Part, string> }
export const STYLES: Style[] = [
  { id: 'modern-white', he: 'לבן מודרני', en: 'Modern white', blurb: 'לבן נקי, אריח בהיר, נגרות לבנה מט ומסגרות שחורות',
    swatch: ['#f5f4f0', '#f1ede6', '#1c1d1f'],
    finishes: { walls: 'paint-pure-white', ceiling: 'paint-pure-white', floor: 'tile-light', joinery: 'lacquer-white', worktop: 'stone-quartz-white', frames: 'metal-black' } },
  { id: 'warm-scandi', he: 'סקנדינבי חם', en: 'Warm Scandinavian', blurb: 'פרקט אלון מולבן, קירות לבן חם, נגרות אלון ומסגרות לבנות',
    swatch: ['#f7efe4', '#f0e2cf', '#eee2d0'],
    finishes: { walls: 'paint-warm-white', ceiling: 'paint-pure-white', floor: 'wood-oak-white', joinery: 'wood-oak', worktop: 'stone-quartz-white', frames: 'metal-white' } },
  { id: 'dark-luxury', he: 'יוקרה כהה', en: 'Dark luxury', blurb: 'פורצלן כהה, קירות גרייז׳, נגרות שחורה, גרניט שחור וברונזה',
    swatch: ['#7b7670', '#232426', '#6b5440'],
    finishes: { walls: 'paint-greige', ceiling: 'paint-pure-white', floor: 'tile-dark', joinery: 'lacquer-black', worktop: 'stone-granite-black', frames: 'metal-bronze' } },
]

/** The finishes a style gives a design (room- and storey-level choices are replaced; geometry and kitchen stay). */
export function withStyle(design: Design, style: Style): Design {
  const finishes: Record<string, string> = {}
  for (const [part, id] of Object.entries(style.finishes)) finishes[`${part}@all`] = id
  return { ...design, finishes }
}
/** Which style a design currently matches exactly, if any. */
export function styleOf(design: Design): Style | null {
  return STYLES.find(s => {
    const keys = Object.keys(design.finishes)
    return keys.length === Object.keys(s.finishes).length && Object.entries(s.finishes).every(([p, id]) => design.finishes[`${p}@all`] === id)
  }) ?? null
}
