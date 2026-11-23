import type { House } from '@planwalk/house'
import { BASE, PARTS, finish } from './catalog'
import { parseTarget, type Design } from './schema'
import { applyEdits, windowInfo, PX_PER_CM, type EditIssue } from './edits'
import { itemRef, pieceName, thing } from './furnish'
import { costReport, type PriceBook } from './cost'

/**
 * What a client changed, in the words an architect needs: every difference between a design and the base house —
 * finishes per room, windows, moved walls, the kitchen — each with where it is on the plan, plus the cost difference.
 * This is the document that replaces the review meeting.
 */
export interface Change {
  kind: 'finish' | 'window' | 'wall' | 'kitchen' | 'furniture'
  storey: number | null
  /** where, in words: a room name, a storey, or the whole house */
  where: string
  what: string
  /** plan px on that storey, for marking the change on the drawing */
  rect?: [number, number, number, number]
  /** a problem with this change (e.g. it breaks a rule) */
  issue?: string
}
export interface ChangeReport {
  changes: Change[]
  counts: { finish: number; window: number; wall: number; kitchen: number; furniture: number }
  cost: { base: number; total: number; difference: number }
  note: string | null
}

const STOREY = ['קומת קרקע', 'קומה ראשונה', 'קומה שנייה']
const MODULE: Record<string, string> = { drawers: 'מגירות', doors: 'ארון', sink: 'כיור', hob: 'כיריים', dishwasher: 'מדיח', corner: 'פינה', fridge: 'מקרר', oven: 'תנור', pantry: 'מזווה', filler: 'פס מילוי' }

export function changeReport(base: House, design: Design, book?: Partial<PriceBook> | null): ChangeReport {
  const changes: Change[] = []
  const roomAt = (f: 0 | 1 | 2, x: number, y: number) => { const fl = base.floors[f]; return fl.rooms.slice(0, fl.indoor).find(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5])?.[0] ?? null }
  // furniture also stands on balconies and in the garden: any room at the point, indoors first, else "outside"
  const ground = ([0, 1, 2] as const).find(f => base.floors[f].walls.length) ?? 0
  const placeAt = (f: 0 | 1 | 2, x: number, y: number) => {
    const out = roomAt(f, x, y) ?? base.floors[f].rooms.slice(base.floors[f].indoor).filter(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5]).sort((a, b) => (a[4] - a[2]) * (a[5] - a[3]) - (b[4] - b[2]) * (b[5] - b[3]))[0]?.[0]
    return out && out !== 'חוץ' ? out : f === ground ? 'גינה' : 'בחוץ'
  }
  const applied = applyEdits(base, design.edits ?? {})
  const issueOf = (key: string) => applied.issues.find((i: EditIssue) => i.key === key)?.message

  // finishes
  for (const [key, id] of Object.entries(design.finishes ?? {})) {
    const t = parseTarget(key); if (!t) continue
    if (id === BASE[t.part]) continue
    const room = t.floor !== undefined && t.room !== undefined ? base.floors[t.floor].rooms[t.room] : null
    const where = room ? `${room[0]} · ${STOREY[t.floor!]}` : t.floor !== undefined ? `כל ${STOREY[t.floor]}` : 'כל הבית'
    changes.push({ kind: 'finish', storey: t.floor ?? null, where, what: `${PARTS[t.part].he}: ${finish(BASE[t.part])?.he ?? BASE[t.part]} ← ${finish(id)?.he ?? id}`, rect: room ? [room[2], room[3], room[4], room[5]] : undefined })
  }
  // geometry
  for (const [key, e] of Object.entries(design.edits ?? {})) {
    if (e.k === 'window') {
      const w = windowInfo(base, e.floor, e.index), g = base.floors[e.floor].glass[e.index]; if (!w || !g) continue
      const parts: string[] = []
      if (e.width != null && e.width !== w.width) parts.push(`רוחב ${w.width} ← ${Math.round(e.width)} ס"מ`)
      if (e.sill != null && e.sill !== w.sill) parts.push(`אדן ${Math.round(w.sill * 100)} ← ${Math.round(e.sill * 100)} ס"מ`)
      if (e.head != null && e.head !== w.head) parts.push(`גובה עליון ${Math.round(w.head * 100)} ← ${Math.round(e.head * 100)} ס"מ`)
      if (e.type) parts.push(`פתיחה: ${{ sliding: 'הזזה', hinged: 'ציר', fixed: 'קבוע' }[e.type]}`)
      if (!parts.length) continue
      const cx = (g[0] + g[2]) / 2, cy = (g[1] + g[3]) / 2
      const room = roomAt(e.floor, cx + 25, cy) ?? roomAt(e.floor, cx - 25, cy) ?? roomAt(e.floor, cx, cy + 25) ?? roomAt(e.floor, cx, cy - 25)
      changes.push({ kind: 'window', storey: e.floor, where: `${room ?? 'חלון'} · ${STOREY[e.floor]}`, what: `חלון: ${parts.join(', ')}`, rect: [g[0], g[1], g[2], g[3]], issue: issueOf(key) })
    } else if (e.k === 'wall') {
      if (!e.by) continue
      const mid = (e.lo + e.hi) / 2
      const before = e.axis === 'x' ? roomAt(e.floor, e.a - 12, mid) : roomAt(e.floor, mid, e.a - 12), after = e.axis === 'x' ? roomAt(e.floor, e.b + 12, mid) : roomAt(e.floor, mid, e.b + 12)
      const grows = e.by > 0 ? before : after, shrinks = e.by > 0 ? after : before
      const what = `קיר הוזז ${Math.abs(Math.round(e.by))} ס"מ${grows && shrinks ? `: ${grows} גדל, ${shrinks} קטן` : ''} (אורך הקיר ${Math.round((e.hi - e.lo) / PX_PER_CM)} ס"מ)`
      changes.push({ kind: 'wall', storey: e.floor, where: `${[before, after].filter(Boolean).join(' / ') || 'קיר פנימי'} · ${STOREY[e.floor]}`, what, rect: e.axis === 'x' ? [e.a, e.lo, e.b, e.hi] : [e.lo, e.a, e.hi, e.b], issue: issueOf(key) })
    } else if (e.k === 'item') {
      const it = base.items.find(i => i.k === 'model' && i.f === e.floor && itemRef(i) === e.ref); if (!it || it.k !== 'model') continue
      const name = pieceName(it.name), cx = (it.r[0] + it.r[2]) / 2, cy = (it.r[1] + it.r[3]) / 2, moved = Math.round(Math.hypot(e.dx, e.dy) / PX_PER_CM)
      const from = placeAt(e.floor, cx, cy), to = placeAt(e.floor, cx + e.dx, cy + e.dy)
      // nouns, not verbs: Hebrew verbs would need each piece's gender
      const what = e.remove ? 'הסרה מהתוכנית' : [moved >= 5 ? (to !== from ? `מעבר אל ${to}` : `הזזה של ${moved} ס"מ`) : '', e.turn ? 'סיבוב' : ''].filter(Boolean).join(', ')
      if (!what) continue
      changes.push({ kind: 'furniture', storey: e.floor, where: `${from} · ${STOREY[e.floor]}`, what: `${name}: ${what}`, rect: [it.r[0] + (e.remove ? 0 : e.dx), it.r[1] + (e.remove ? 0 : e.dy), it.r[2] + (e.remove ? 0 : e.dx), it.r[3] + (e.remove ? 0 : e.dy)], issue: issueOf(key) })
    } else if (e.k === 'add') {
      const t = thing(e.thing); if (!t) continue
      const w = (e.turn % 2 ? t.d : t.w) * PX_PER_CM / 2, d = (e.turn % 2 ? t.w : t.d) * PX_PER_CM / 2
      changes.push({ kind: 'furniture', storey: e.floor, where: `${placeAt(e.floor, e.x, e.y)} · ${STOREY[e.floor]}`, what: `נוסף: ${t.he} (${t.w} × ${t.d} ס"מ)`, rect: [e.x - w, e.y - d, e.x + w, e.y + d], issue: issueOf(key) })
    } else if (e.k === 'run') {
      const count = new Map<string, number>(); for (const m of e.modules) count.set(m.t, (count.get(m.t) ?? 0) + 1)
      const list = [...count].map(([t, n]) => `${n} ${MODULE[t] ?? t}`).join(', ')
      const len = e.length * PX_PER_CM, depth = e.depth * PX_PER_CM, back = e.axis === 'x' ? e.y : e.x
      const c1 = e.facing > 0 ? back : back - depth, c2 = e.facing > 0 ? back + depth : back
      const rect: [number, number, number, number] = e.axis === 'x' ? [e.x, c1, e.x + len, c2] : [c1, e.y, c2, e.y + len]
      const room = roomAt(e.floor, (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2)
      changes.push({ kind: 'kitchen', storey: e.floor, where: `${room ?? 'מטבח'} · ${STOREY[e.floor]}`, what: `מטבח באורך ${Math.round(e.length)} ס"מ: ${list}${e.uppers ? ', עם ארונות עליונים' : ''}`, rect, issue: issueOf(key) })
    }
  }
  const order = { wall: 0, window: 1, kitchen: 2, furniture: 3, finish: 4 } as const
  changes.sort((a, b) => order[a.kind] - order[b.kind] || (b.storey ?? -1) - (a.storey ?? -1))
  const c = costReport(base, design, book)
  const n = (k: Change['kind']) => changes.filter(x => x.kind === k).length
  return { changes, counts: { finish: n('finish'), window: n('window'), wall: n('wall'), kitchen: n('kitchen'), furniture: n('furniture') }, cost: { base: Math.round(c.baseTotal), total: Math.round(c.total), difference: Math.round(c.upgrade) }, note: design.note?.trim() || null }
}
