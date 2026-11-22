import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Viewer, SurfaceHit } from '@planwalk/engine'
import type { House, StoreyId } from '@planwalk/house'
import { DesignDoc, PARTS, PART_IDS, ROOM_PARTS, emptyDesign, finish, finishesFor, resolveFinish, roomLooks, storeyLooks, targetKey, validate, type Design, type Part } from '@planwalk/design'
import { api, ApiError, STATIC, type DesignRow, type HouseMeta } from '../api'

type Scope = 'all' | 'floor' | 'room'
const isRoomPart = (p: Part) => (ROOM_PARTS as readonly string[]).includes(p)
const FROM_LABEL = { base: 'בסיס', all: 'כל הבית', floor: 'הקומה', room: 'החדר' }

/**
 * Design mode (sheet A-03): choose finishes per part for the whole house or one storey, undo/redo, save as versions.
 * Team members save to the server; everyone else (and the static demo) can try it out locally.
 */
export function DesignPanel({ viewer, house, houseId, meta, floor, onClose }: { viewer: Viewer; house: House; houseId: string; meta: HouseMeta; floor: StoreyId; onClose: () => void }) {
  const docRef = useRef(new DesignDoc(emptyDesign()))
  const [, bump] = useState(0)
  const rerender = useCallback(() => bump(n => n + 1), [])
  const doc = docRef.current
  const member = !STATIC && !!meta.viewer.role
  const [list, setList] = useState<DesignRow[]>([])
  const [can, setCan] = useState({ create: false, update: false, delete: false })
  const [active, setActive] = useState<{ id: string; name: string; version: number } | null>(null)
  const [scope, setScope] = useState<Scope>('all')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; theirs?: { data: unknown; version: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')

  const show = useCallback((d: Design) => viewer.applyDesign(storeyLooks(d), roomLooks(d)), [viewer])
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

  const issues = useMemo(() => validate(doc.design, house), [doc.design, house])
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
