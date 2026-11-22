import type { House } from '@planwalk/house'
import { PARTS, finish } from './catalog'
import { parseTarget, type Design } from './schema'

export interface Issue { target: string; level: 'error' | 'warning'; message: string }

/** Checks that keep a design buildable and meaningful. Errors block saving; warnings are shown. */
export function validate(design: Design, house?: House): Issue[] {
  const issues: Issue[] = []
  for (const [target, id] of Object.entries(design.finishes)) {
    const t = parseTarget(target)
    if (!t) { issues.push({ target, level: 'error', message: 'Unknown target' }); continue }
    const fin = finish(id)
    if (!fin) { issues.push({ target, level: 'error', message: `Unknown finish "${id}"` }); continue }
    const allowed = PARTS[t.part].allowed as readonly string[]
    if (!allowed.includes(fin.category)) issues.push({ target, level: 'error', message: `${fin.en} (${fin.category}) can't be used on ${PARTS[t.part].en.toLowerCase()}` })
    if (t.room != null && !['floor', 'walls', 'ceiling'].includes(t.part)) { issues.push({ target, level: 'error', message: `${PARTS[t.part].en} is chosen per storey or for the whole house, not per room` }); continue }
    if (house && t.floor != null && t.room != null) {
      const fl = house.floors[t.floor]
      if (!fl || t.room >= fl.indoor) { issues.push({ target, level: 'error', message: 'That room is not in this house' }); continue }
      const name = fl.rooms[t.room][0]
      const wet = /מקלחת|אמבט|שירותי|כביסה|bath|wc|laundry/i.test(name)
      if (wet && t.part === 'floor' && fin.category === 'wood') issues.push({ target, level: 'warning', message: `Wood floor in a wet room (${name})` })
      if (wet && t.part === 'walls' && fin.category === 'paint') issues.push({ target, level: 'warning', message: `Paint in a wet room (${name}): needs moisture-resistant paint or tiles near water` })
    }
  }
  return issues
}
