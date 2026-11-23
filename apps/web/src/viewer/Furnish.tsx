import { useEffect, useMemo, useRef, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { House, StoreyId } from '@planwalk/house'
import { applyEdits, FIXED, PX_PER_CM, THINGS, THING_GROUPS, pieceName, thing, type AddEdit, type ItemEdit, type Thing } from '@planwalk/design'
import { renderDesign, type DesignSession } from './DesignPanel'

const FIXED_NAMES = [...FIXED]
const newId = () => Math.random().toString(36).slice(2, 8)
type FEdit = ItemEdit | AddEdit

/**
 * Furniture and garden: press a piece to select it, drag it over the floor, turn it, take it out, or bring in new
 * pieces from the catalogue (indoors, on a balcony, in the garden). Everything is a design edit: undoable, saved
 * with the client's choices, and listed for the architect.
 */
export function FurnishPanel({ viewer, house, floor, session, onHouse, onClose, onChanged }: { viewer: Viewer; house: House; floor: StoreyId; session: DesignSession; onHouse: (h: House) => void; onClose: () => void; onChanged: () => void }) {
  const doc = session.doc
  const [, bump] = useState(0)
  const eff = useMemo(() => applyEdits(house, doc.design.edits), [house, doc.design.edits])
  const effRef = useRef(eff); effRef.current = eff
  const [sel, setSel] = useState<string | null>(null), [tab, setTab] = useState<'in' | 'out'>('in'), [note, setNote] = useState<string | null>(null)
  const pose = useRef({ x: 0, y: 0, yaw: 0 })
  const edits = doc.design.edits as unknown as Record<string, FEdit | { k: string }>
  const commit = (fn: () => boolean) => { if (fn()) { renderDesign(viewer, house, session, onHouse, doc.design); onChanged(); bump(n => n + 1) } }

  const moveBy = (key: string, dx: number, dy: number) => commit(() => {
    const e = edits[key] as FEdit | undefined
    if (key.startsWith('add:')) return e?.k === 'add' ? doc.setEdit(key, { ...e, x: e.x + dx, y: e.y + dy }) : false
    const cur = e?.k === 'item' ? e : null, floorOf = Number(key[6]) as StoreyId, ref = key.slice(8)
    const next: ItemEdit = { k: 'item', floor: floorOf, ref, dx: (cur?.dx ?? 0) + dx, dy: (cur?.dy ?? 0) + dy, ...(cur?.turn ? { turn: cur.turn } : {}) }
    return doc.setEdit(key, next.dx || next.dy || next.turn ? next : null)
  })
  const turn = (key: string) => commit(() => {
    const e = edits[key] as FEdit | undefined
    if (key.startsWith('add:')) return e?.k === 'add' ? doc.setEdit(key, { ...e, turn: (e.turn + 1) % 4 }) : false
    const cur = e?.k === 'item' ? e : null, t = ((cur?.turn ?? 0) + 1) % 4
    const next: ItemEdit = { k: 'item', floor: Number(key[6]) as StoreyId, ref: key.slice(8), dx: cur?.dx ?? 0, dy: cur?.dy ?? 0, ...(t ? { turn: t } : {}) }
    return doc.setEdit(key, next.dx || next.dy || next.turn ? next : null)
  })
  const remove = (key: string) => { commit(() => key.startsWith('add:') ? doc.setEdit(key, null) : doc.setEdit(key, { k: 'item', floor: Number(key[6]), ref: key.slice(8), dx: 0, dy: 0, remove: true })); setSel(null) }
  const restore = (key: string) => commit(() => doc.setEdit(key, null))

  // arranging mode in the engine, and its events
  useEffect(() => { viewer.setArranging(true, FIXED_NAMES); return () => viewer.setArranging(false) }, [viewer])
  useEffect(() => viewer.on('pose', p => { pose.current = p }), [viewer])
  useEffect(() => viewer.on('item', hit => setSel(hit ? effRef.current.itemKeys[hit.index] ?? null : null)), [viewer])
  const moveRef = useRef(moveBy); moveRef.current = moveBy
  useEffect(() => viewer.on('itemMoved', m => { const key = effRef.current.itemKeys[m.index]; if (key) moveRef.current(key, m.dx, m.dy) }), [viewer])
  useEffect(() => viewer.on('tap', () => viewer.selectItem(null)), [viewer])     // a tap that did not land on a piece
  // keep the outline on the chosen piece after the house was redrawn
  useEffect(() => { const i = sel ? eff.itemKeys.indexOf(sel) : -1; viewer.selectItem(i >= 0 ? i : null) }, [viewer, eff, sel])
  const selRef = useRef(sel); selRef.current = sel
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,textarea,select')) return
      const key = selRef.current
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); commit(() => (e.shiftKey ? doc.redo() : doc.undo())); return }
      if (!key) return
      if (e.key.toLowerCase() === 'r' || e.key === 'ר') { e.preventDefault(); turn(key) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(key) }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })

  // a new piece: in front of you indoors or on a balcony; garden pieces chosen from inside go to the garden
  const add = (t: Thing) => {
    const p = pose.current, dir = [-Math.sin(p.yaw), -Math.cos(p.yaw)], fl = house.floors[floor]
    const indoor = (x: number, y: number) => fl.rooms.slice(0, fl.indoor).some(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5])
    const balcony = (x: number, y: number) => fl.rooms.slice(fl.indoor).some(r => r[0] !== 'חוץ' && x >= r[2] && x < r[4] && y >= r[3] && y < r[5])
    const ahead = [150, 100, 60, 0].map(d => [p.x + dir[0] * d, p.y + dir[1] * d]).find(([x, y]) => indoor(x, y) || balcony(x, y)) ?? [p.x, p.y]
    const walking = viewer.state.mode === 'walk'
    let e: AddEdit
    if (t.where === 'in' || (walking && balcony(ahead[0], ahead[1]))) {
      e = { k: 'add', floor, id: newId(), thing: t.id, x: Math.round(ahead[0]), y: Math.round(ahead[1]), turn: 0, ...(t.where === 'out' || !indoor(ahead[0], ahead[1]) ? { out: true } : {}) }
      setNote(null)
    } else {
      // the garden: on the ground storey, on the side away from the street, a step apart from the last one
      const g = ([0, 1, 2] as StoreyId[]).find(f => house.floors[f].walls.length) ?? 0, b = house.floors[g].bounds, street = house.site?.street ?? 'y-'
      const n = Object.values(edits).filter(x => x.k === 'add' && (x as AddEdit).out && (x as AddEdit).floor === g).length, step = (n % 5) * 130 - 260, back = 280 + Math.floor(n / 5) * 160
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
      const [x, y] = street === 'y-' ? [cx + step, b[3] + back] : street === 'y+' ? [cx + step, b[1] - back] : street === 'x-' ? [b[2] + back, cy + step] : [b[0] - back, cy + step]
      e = { k: 'add', floor: g, id: newId(), thing: t.id, x: Math.round(x), y: Math.round(y), turn: 0, out: true }
      viewer.viewFromAbove(g, x, y)
      setNote('עברנו למבט מלמעלה על הגינה. גררו את הפריט למקום שלו; גרירה על הדשא מסובבת את המבט.')
    }
    const key = `add:f${e.floor}.${e.id}`
    commit(() => doc.setEdit(key, e)); setSel(key)
  }

  const selItem = sel ? eff.house.items[eff.itemKeys.indexOf(sel)] : null
  const selEdit = sel ? (edits[sel] as FEdit | undefined) : undefined
  const movedCm = selEdit?.k === 'item' ? Math.round(Math.hypot(selEdit.dx, selEdit.dy) / PX_PER_CM) : 0
  const removed = Object.entries(edits).filter(([, e]) => e.k === 'item' && (e as ItemEdit).remove) as Array<[string, ItemEdit]>
  const count = Object.values(edits).filter(e => e.k === 'item' || e.k === 'add').length
  const things = THINGS.filter(t => t.where === tab && viewer.hasModel(t.model))
  const groups = [...new Set(things.map(t => t.group))]

  return (
    <section className="panel drawer furnish" aria-label="ריהוט וגינה">
      <header><h2>ריהוט וגינה</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <p className="fine">לחצו על רהיט כדי לבחור אותו, וגררו כדי להזיז. אסלה, אמבטיה ואי המטבח נשארים במקומם.</p>
      {selItem && selItem.k === 'model' && sel ? (
        <div className="selbox" role="group" aria-label="הפריט שנבחר">
          <b>{sel.startsWith('add:') ? thing((selEdit as AddEdit | undefined)?.thing ?? '')?.he ?? pieceName(selItem.name) : pieceName(selItem.name)}</b>
          <small>{Math.round((selItem.r[2] - selItem.r[0]) / PX_PER_CM)} × {Math.round((selItem.r[3] - selItem.r[1]) / PX_PER_CM)} ס״מ{sel.startsWith('add:') ? ' · פריט שהוספתם' : movedCm ? ` · ${movedCm} ס״מ מהמקום בתוכנית` : ''}</small>
          <div className="row">
            <button className="btn" onClick={() => turn(sel)}>סיבוב ↻</button>
            <button className="btn" onClick={() => remove(sel)}>הסרה</button>
            {!sel.startsWith('add:') && selEdit && <button className="btn" onClick={() => restore(sel)}>חזרה למקום</button>}
          </div>
        </div>
      ) : <p className="selbox empty">לא נבחר פריט.</p>}
      {note && <p className="warnline" role="status">{note}</p>}

      <div className="seg tabs2" role="tablist">
        <button className="btn" role="tab" aria-selected={tab === 'in'} aria-pressed={tab === 'in'} onClick={() => setTab('in')}>בבית</button>
        <button className="btn" role="tab" aria-selected={tab === 'out'} aria-pressed={tab === 'out'} onClick={() => setTab('out')}>גינה ומרפסת</button>
      </div>
      {groups.map(g => (
        <div key={g} className="cat">
          <h3>{THING_GROUPS[g]}</h3>
          <div className="things">{things.filter(t => t.group === g).map(t => <button key={t.id} className="thing" onClick={() => add(t)}><b>{t.he}</b><small>{t.w} × {t.d}</small></button>)}</div>
        </div>
      ))}
      {removed.length > 0 && (
        <div className="cat">
          <h3>הוסרו מהתוכנית</h3>
          <ul className="removed">{removed.map(([key, e]) => <li key={key}><span>{pieceName(e.ref.replace(/-(-?\d+)-(-?\d+)$/, ''))} · {house.floors[e.floor].name}</span><button className="link" onClick={() => restore(key)}>החזרה</button></li>)}</ul>
        </div>
      )}
      <div className="row foot">
        <button className="btn" disabled={!doc.canUndo} onClick={() => commit(() => doc.undo())}>ביטול</button>
        <button className="btn" disabled={!doc.canRedo} onClick={() => commit(() => doc.redo())}>שחזור</button>
        <span className="fine">{count ? `${count} שינויים בריהוט` : 'בלי שינויים בריהוט'}</span>
      </div>
    </section>
  )
}
