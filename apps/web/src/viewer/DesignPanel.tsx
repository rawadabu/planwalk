import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Viewer, SurfaceHit } from '@planwalk/engine'
import type { House, StoreyId } from '@planwalk/house'
import { DesignDoc, PARTS, PART_IDS, ROOM_PARTS, PX_PER_CM, applyEdits, editKey, emptyDesign, findPartition, finish, finishesFor, resolveFinish, roomLooks, storeyLooks, targetKey, validate, windowInfo, type Design, type Part, type WallEdit, type WindowEdit } from '@planwalk/design'
import { api, ApiError, STATIC, type DesignRow, type HouseMeta } from '../api'

type Scope = 'all' | 'floor' | 'room'
const isRoomPart = (p: Part) => (ROOM_PARTS as readonly string[]).includes(p)
const FROM_LABEL = { base: 'בסיס', all: 'כל הבית', floor: 'הקומה', room: 'החדר' }

/**
 * Design mode (sheet A-03): choose finishes per part for the whole house or one storey, undo/redo, save as versions.
 * Team members save to the server; everyone else (and the static demo) can try it out locally.
 */
/** What design mode keeps while the page is open (the panel can close and reopen). */
export interface DesignSession { doc: DesignDoc; active: { id: string; name: string; version: number } | null; shownEdits: string }
export const newDesignSession = (): DesignSession => ({ doc: new DesignDoc(emptyDesign()), active: null, shownEdits: '{}' })

export function DesignPanel({ viewer, house, houseId, meta, floor, onClose, onHouse, session }: { viewer: Viewer; house: House; houseId: string; meta: HouseMeta; floor: StoreyId; onClose: () => void; onHouse: (h: House) => void; session: DesignSession }) {
  const docRef = useRef(session.doc)
  const [, bump] = useState(0)
  const rerender = useCallback(() => bump(n => n + 1), [])
  const doc = docRef.current
  const member = !STATIC && !!meta.viewer.role
  const [list, setList] = useState<DesignRow[]>([])
  const [can, setCan] = useState({ create: false, update: false, delete: false })
  const [active, setActiveState] = useState(session.active)
  const setActive = (a: DesignSession['active']) => { session.active = a; setActiveState(a) }
  const [scope, setScope] = useState<Scope>('all')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; theirs?: { data: unknown; version: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')

  // geometry edits → an effective house (the base `house` is never changed); rebuilt in 3D only when edits change
  const show = useCallback((d: Design) => {
    const key = JSON.stringify(d.edits)
    if (key !== session.shownEdits) { session.shownEdits = key; const eff = applyEdits(house, d.edits).house; viewer.setHouse(eff); onHouse(eff) }
    viewer.applyDesign(storeyLooks(d), roomLooks(d))
  }, [viewer, house, onHouse, session])
  const eff = useMemo(() => applyEdits(house, doc.design.edits), [house, doc.design.edits])
  const change = (fn: () => boolean) => { if (fn()) { show(doc.design); setMsg(null); rerender() } }

  // load the list of saved designs
  const refresh = useCallback(async () => {
    if (!member) return
    try { const r = await api.designs(houseId); setList(r.designs); setCan(r.can) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }, [member, houseId])
  useEffect(() => { refresh() }, [refresh])
  // leaving design mode keeps what is on screen; the base comes back only when chosen
  useEffect(() => { show(doc.design) }, [show, doc])

  // keyboard: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || (e.target as HTMLElement).closest?.('input,textarea')) return
      e.preventDefault(); change(() => (e.shiftKey ? doc.redo() : doc.undo()))
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })

  const open = async (id: string | '') => {
    if (doc.dirty && !confirmLeave) { setConfirmLeave(id || 'base'); return }
    setConfirmLeave(null)
    if (!id) { doc.reset(emptyDesign()); setActive(null); show(doc.design); rerender(); return }
    try { const d = await api.design(id); doc.reset(d.data as Design); setActive({ id: d.id, name: d.name, version: d.version }); show(doc.design); setMsg(null); rerender() }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null)

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newName.trim()) return
    setBusy(true)
    try {
      const d = await api.createDesign(houseId, { name: newName.trim(), from: active?.id })
      // a new design starts from what is on screen (including unsaved choices)
      const saved = doc.dirty ? await api.saveDesign(d.id, { version: d.version, data: doc.design }) : d
      doc.reset(saved.data as Design); setActive({ id: saved.id, name: saved.name, version: saved.version }); setNewName(''); await refresh()
      setMsg({ ok: true, text: `נשמר בשם "${saved.name}"` }); rerender()
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
  }
  const save = async () => {
    if (!active) return
    setBusy(true)
    try {
      const d = await api.saveDesign(active.id, { version: active.version, data: doc.design })
      setActive({ ...active, version: d.version }); doc.markSaved(); await refresh()
      setMsg({ ok: true, text: `נשמר · גרסה ${d.version}` }); rerender()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setMsg({ ok: false, text: 'מישהו שמר את העיצוב הזה אחרי שפתחת אותו.', theirs: { data: err.body.current.data, version: err.body.current.version } })
      else setMsg({ ok: false, text: (err as Error).message })
    } finally { setBusy(false) }
  }
  const takeTheirs = () => { if (!msg?.theirs || !active) return; doc.reset(msg.theirs.data as Design); setActive({ ...active, version: msg.theirs.version }); show(doc.design); setMsg(null); rerender() }

  // click a surface in the house to select it (A-04)
  const [sel, setSel] = useState<SurfaceHit | null>(null)
  useEffect(() => viewer.on('tap', e => {
    const h = viewer.pickSurface(e.clientX, e.clientY)
    setSel(h); viewer.highlight(h)
    if (h) setScope(h.room != null && isRoomPart(h.part) ? 'room' : 'floor')
  }), [viewer])
  useEffect(() => () => viewer.highlight(null), [viewer])
  const clearSel = () => { setSel(null); viewer.highlight(null); setScope('all') }

  const issues = useMemo(() => [...validate(doc.design, house), ...eff.issues.map(i => ({ target: i.key, level: i.level, message: i.message }))], [doc.design, house, eff])
  const selFloor = (sel?.floor ?? floor) as StoreyId
  const sc = scope === 'room' && sel?.room != null ? { floor: selFloor, room: sel.room } : scope === 'floor' ? { floor: selFloor } : {}
  const floorName = house.floors[selFloor].name
  const parts = scope === 'room' ? PART_IDS.filter(isRoomPart) : PART_IDS
  const ordered = sel ? [sel.part, ...parts.filter(p => p !== sel.part)].filter(p => parts.includes(p)) : parts

  return (
    <section className="panel drawer design" aria-label="עיצוב">
      <header><h2>עיצוב</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>

      {member ? (
        <div className="dsel">
          <label className="field">עיצוב פעיל
            <select value={active?.id ?? ''} onChange={e => open(e.target.value)}>
              <option value="">הבסיס של האדריכל</option>
              {list.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          {confirmLeave && <p className="warnline">יש שינויים שלא נשמרו. <button className="link" onClick={() => { doc.markSaved(); open(confirmLeave === 'base' ? '' : confirmLeave) }}>לעבור בכל זאת</button> · <button className="link" onClick={() => setConfirmLeave(null)}>להישאר</button></p>}
          {can.create && <form className="row2" onSubmit={create}><input value={newName} maxLength={80} onChange={e => setNewName(e.target.value)} placeholder={active ? 'שכפול בשם…' : 'שם לעיצוב חדש, למשל: מטבח כחול'} aria-label="שם לעיצוב חדש" /><button className="btn" disabled={busy || !newName.trim()}>{active ? 'שמירה בשם' : 'עיצוב חדש'}</button></form>}
        </div>
      ) : <p className="fine">{STATIC ? 'בדמו אפשר לנסות. שמירת עיצובים זמינה באפליקציה המלאה.' : 'אפשר לנסות כאן. שמירה זמינה לצוות הפרויקט.'}</p>}

      {sel ? (
        <div className="selcard">
          <span><b>{sel.roomName ?? floorName}</b> · {PARTS[sel.part].he}</span>
          <button className="btn x" onClick={clearSel} aria-label="ביטול הבחירה">✕</button>
        </div>
      ) : <p className="hintline">לחצו על קיר, רצפה, תקרה או ארון בבית כדי לבחור אותו.</p>}

      <div className="seg2" role="group" aria-label="היקף השינוי">
        <button className="btn" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>כל הבית</button>
        <button className="btn" aria-pressed={scope === 'floor'} onClick={() => setScope('floor')}>{floorName}</button>
        <button className="btn" aria-pressed={scope === 'room'} disabled={sel?.room == null} onClick={() => setScope('room')}>{sel?.roomName ?? 'חדר'}</button>
      </div>

      {sel?.window != null && <WindowEditor house={eff.house} floor={sel.floor} index={sel.window} design={doc.design} onEdit={(k, e) => change(() => doc.setEdit(k, e))} />}
      {sel?.part === 'walls' && sel.face && <WallEditor base={house} eff={eff.house} sel={sel} design={doc.design} onEdit={(k, e) => change(() => doc.setEdit(k, e))} onFollow={setSel} />}

      {ordered.map(part => <PartRow key={part} part={part} design={doc.design} scope={sc} selected={sel?.part === part}
        onPick={id => change(() => doc.set(targetKey(part, sc), id))} />)}

      {issues.length > 0 && <ul className="issues">{issues.map((i, n) => <li key={n} className={i.level}>{i.message}</li>)}</ul>}

      <div className="dfoot">
        <button className="btn" disabled={!doc.canUndo} onClick={() => change(() => doc.undo())} aria-label="ביטול (Ctrl+Z)">↶ ביטול</button>
        <button className="btn" disabled={!doc.canRedo} onClick={() => change(() => doc.redo())} aria-label="חזרה (Ctrl+Shift+Z)">↷ חזרה</button>
        <span className="grow" />
        {member && active && can.update && <button className="btn primary" disabled={busy || !doc.dirty || issues.some(i => i.level === 'error')} onClick={save}>{doc.dirty ? 'שמירה' : 'נשמר'}</button>}
      </div>
      {active && <p className="fine">גרסה {active.version}{doc.dirty ? ' · יש שינויים שלא נשמרו' : ''}</p>}
      {msg && <p className={msg.ok ? 'okline' : 'errline'} role="status">{msg.text}{msg.theirs && <> <button className="link" onClick={takeTheirs}>לטעון את הגרסה שלהם</button></>}</p>}
    </section>
  )
}

function PartRow({ part, design, scope, selected, onPick }: { part: Part; design: Design; scope: { floor?: StoreyId; room?: number }; selected?: boolean; onPick: (id: string | null) => void }) {
  const r = resolveFinish(design, part, scope)
  const own = design.finishes[targetKey(part, scope)] ?? null
  const cur = finish(r.id)
  return (
    <div className={"part" + (selected ? " on" : "")}>
      <div className="ph"><b>{PARTS[part].he}</b><span className="cur">{cur?.he}<em>{FROM_LABEL[r.from]}</em></span></div>
      <div className="sw" role="radiogroup" aria-label={PARTS[part].he}>
        {finishesFor(part).map(f => (
          <button key={f.id} role="radio" aria-checked={r.id === f.id} title={f.he} aria-label={f.he} onClick={() => onPick(f.id)}
            className={'chip tex-' + (f.look.texture ?? 'none')} style={{ ['--c' as string]: f.look.color }} />
        ))}
        {own && <button className="btn reset" onClick={() => onPick(null)}>ביטול הבחירה</button>}
      </div>
    </div>
  )
}

const TYPES: Array<[WindowEdit['type'], string]> = [['sliding', 'הזזה'], ['hinged', 'ציר'], ['fixed', 'קבוע']]
/** Width, sill, head and opening type of one window (A-04b). */
function WindowEditor({ house, floor, index, design, onEdit }: { house: House; floor: StoreyId; index: number; design: Design; onEdit: (key: string, e: WindowEdit | null) => void }) {
  const w = windowInfo(house, floor, index); if (!w) return null
  const key = editKey({ k: 'window', floor, index })
  const cur = (design.edits[key] as WindowEdit | undefined) ?? { k: 'window', floor, index }
  const set = (patch: Partial<WindowEdit>) => onEdit(key, { ...cur, ...patch })
  const num = (label: string, val: number, unit: string, step: number, on: (v: number) => void) => (
    <label className="numrow">{label}
      <span className="stepper">
        <button type="button" className="btn" onClick={() => on(val - step)} aria-label={`${label} פחות`}>−</button>
        <input inputMode="numeric" value={val} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) on(v) }} aria-label={label} />
        <span className="unit">{unit}</span>
        <button type="button" className="btn" onClick={() => on(val + step)} aria-label={`${label} יותר`}>+</button>
      </span>
    </label>
  )
  return (
    <div className="editbox">
      <div className="ph"><b>חלון</b>{design.edits[key] && <button className="btn reset" onClick={() => onEdit(key, null)}>חזרה לתוכנית</button>}</div>
      {num('רוחב', w.width, 'ס״מ', 10, v => set({ width: v }))}
      {num('גובה אדן', Math.round(w.sill * 100), 'ס״מ', 10, v => set({ sill: v / 100 }))}
      {num('גובה משקוף', Math.round(w.head * 100), 'ס״מ', 10, v => set({ head: v / 100 }))}
      <div className="sw" role="radiogroup" aria-label="סוג פתיחה">
        {TYPES.map(([t, n]) => <button key={t} role="radio" aria-checked={(cur.type ?? 'sliding') === t} className="btn pillbtn" onClick={() => set({ type: t })}>{n}</button>)}
      </div>
    </div>
  )
}

/** Move an interior partition (A-04b). The partition is found in the edited house; the edit is stored against the base. */
function WallEditor({ base, eff, sel, design, onEdit, onFollow }: { base: House; eff: House; sel: SurfaceHit; design: Design; onEdit: (key: string, e: WallEdit | null) => void; onFollow: (s: SurfaceHit) => void }) {
  const f = sel.face!, along = f.axis === 'x' ? sel.y : sel.x
  const found = findPartition(eff, sel.floor, f.axis, f.at, along)
  if (!found.ok) return <div className="editbox"><div className="ph"><b>קיר</b></div><p className="fine">{found.reason === 'Outside walls stay where the architect drew them' ? 'קיר חיצוני נשאר במקום שבו האדריכל שרטט אותו.' : 'לא נמצא כאן קיר פנימי שאפשר להזיז.'}</p></div>
  const w = found.wall
  // already moved? find the edit whose moved faces sit here
  const existing = Object.entries(design.edits).find(([, e]) => e.k === 'wall' && e.floor === sel.floor && e.axis === w.axis && Math.abs(e.a + e.by * PX_PER_CM - w.a) < 2 && e.lo < w.hi && e.hi > w.lo) as [string, WallEdit] | undefined
  const edit: WallEdit = existing ? existing[1] : { k: 'wall', ...w, by: 0 }
  const key = existing ? existing[0] : editKey(edit)
  const fl = eff.floors[sel.floor], ax = w.axis === 'x' ? 0 : 1, mid = (w.lo + w.hi) / 2
  const roomAt = (x: number, y: number) => fl.rooms.slice(0, fl.indoor).find(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5])?.[0] ?? '—'
  const sideA = ax === 0 ? roomAt(w.a - 10, mid) : roomAt(mid, w.a - 10), sideB = ax === 0 ? roomAt(w.b + 10, mid) : roomAt(mid, w.b + 10)
  // the selection follows the wall, so the next click keeps moving the same wall
  const follow = (cm: number) => { const d = cm * PX_PER_CM; onFollow({ ...sel, face: { ...f, at: f.at + d }, ...(ax === 0 ? { x: sel.x + d } : { y: sel.y + d }) }) }
  const move = (cm: number) => { onEdit(key, { ...edit, by: edit.by + cm }); follow(cm) }
  return (
    <div className="editbox">
      <div className="ph"><b>קיר פנימי · {w.thickness} ס״מ</b>{existing && <button className="btn reset" onClick={() => { onEdit(key, null); follow(-edit.by) }}>חזרה לתוכנית</button>}</div>
      <p className="fine">בין {sideA} ל{sideB}{edit.by ? ` · הוזז ${Math.abs(edit.by)} ס״מ` : ''}</p>
      <div className="row2">
        <button className="btn" onClick={() => move(10)}>{sideA} +10 ס״מ</button>
        <button className="btn" onClick={() => move(-10)}>{sideB} +10 ס״מ</button>
      </div>
    </div>
  )
}
