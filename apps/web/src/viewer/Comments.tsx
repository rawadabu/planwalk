import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewer, PlanPoint } from '@planwalk/engine'
import type { House, StoreyId } from '@planwalk/house'
import { api, ApiError, type Comment, type HouseMeta } from '../api'

const NAME_KEY = 'planwalk.guestName'
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' } }
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n) } catch { /* private mode */ } }
const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Comment threads pinned to spots in the house: list + composer (panel) and numbered pins over the 3D view. */
export function useComments(houseId: string, share: string | undefined, meta: HouseMeta | null) {
  const [list, setList] = useState<Comment[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    if (!meta) return
    api.comments(houseId, share).then(setList).catch(e => setError(e instanceof ApiError ? e.message : 'Could not load comments'))
  }, [houseId, share, meta])
  useEffect(load, [load])
  return { list, setList, error, setError, reload: load }
}

export function CommentsPanel({ viewer, house, houseId, share, meta, floor, state, selected, setSelected, onClose }: {
  viewer: Viewer; house: House; houseId: string; share?: string; meta: HouseMeta; floor: StoreyId
  state: ReturnType<typeof useComments>; selected: string | null; setSelected: (id: string | null) => void; onClose: () => void
}) {
  const { list, setList, error, setError } = state
  const [placing, setPlacing] = useState(false)
  const [draft, setDraft] = useState<{ at: PlanPoint; text: string } | null>(null)
  const [reply, setReply] = useState<{ to: string; text: string } | null>(null)
  const [name, setName] = useState(readName)
  const [showResolved, setShowResolved] = useState(false)
  const [busy, setBusy] = useState(false)
  const guest = !meta.viewer.role

  useEffect(() => {
    if (!placing) return
    viewer.setMeasuring(false)
    return viewer.on('tap', e => {
      const at = viewer.pick(e.clientX, e.clientY)
      if (at) { setDraft({ at, text: '' }); setPlacing(false) }
    })
  }, [viewer, placing])

  const post = async (body: string, at: PlanPoint, parentId?: string) => {
    if (guest && !name.trim()) { setError('כתבו את השם שלכם, כדי שהצוות יידע מי כתב'); return false }
    setBusy(true); setError(null)
    try {
      const c = await api.addComment(houseId, { body, floor: at.floor, x: at.x, y: at.y, h: at.h, parentId, authorName: guest ? name.trim() : undefined }, share)
      if (guest) saveName(name.trim())
      setList(l => [...l, c]); if (!parentId) setSelected(c.id)
      return true
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The comment was not saved'); return false } finally { setBusy(false) }
  }
  const resolve = async (c: Comment) => {
    try { const r = await api.resolveComment(c.id, !c.resolved); setList(l => l.map(x => (x.id === c.id ? { ...x, resolved: r.resolved } : x))) } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed') }
  }
  const remove = async (c: Comment) => {
    try { await api.deleteComment(c.id, share); setList(l => l.filter(x => x.id !== c.id && x.parentId !== c.id)) } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed') }
  }
  const go = (c: Comment) => { setSelected(c.id); if (c.floor !== floor) viewer.setFloor(c.floor); viewer.teleport(c.x, c.y + 120) }

  const roots = list.filter(c => !c.parentId && (showResolved || !c.resolved))
  const resolvedCount = list.filter(c => !c.parentId && c.resolved).length
  const floorName = (f: number) => house.floors[f as StoreyId].name

  return (
    <section className="panel drawer comments" aria-label="הערות">
      <header><h2>הערות</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      {!meta.can.comment ? (
        <p className="fine">{meta.viewer.via === 'public' ? 'הערות זמינות לצוות הפרויקט ולמי שקיבל קישור עם הרשאת הערות.' : 'הקישור הזה מאפשר צפייה בלבד.'}</p>
      ) : (
        <>
          {guest && <label className="field">השם שלכם<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="לדוגמה: דנה, קונה דירה 7" /></label>}
          {!draft && <button className="btn primary wide" aria-pressed={placing} onClick={() => setPlacing(p => !p)}>{placing ? 'לחצו על מקום בבית… (ביטול)' : '+ הערה חדשה במקום מסוים'}</button>}
          {draft && (
            <form className="compose" onSubmit={async e => { e.preventDefault(); if (draft.text.trim() && (await post(draft.text.trim(), draft.at))) setDraft(null) }}>
              <div className="fine">{floorName(draft.at.floor)}{draft.at.h > 0.3 ? ` · בגובה ${draft.at.h.toFixed(1)} מ׳` : ''}</div>
              <textarea autoFocus rows={3} maxLength={2000} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} placeholder="מה לשנות כאן? למשל: להזיז את השקע, להגדיל את החלון" />
              <div className="row2"><button className="btn primary" disabled={busy || !draft.text.trim()}>שמירה</button><button type="button" className="btn" onClick={() => setDraft(null)}>ביטול</button></div>
            </form>
          )}
        </>
      )}
      {error && <p className="errline" role="alert">{error}</p>}
      <ol className="threads">
        {roots.map(c => {
          const n = list.filter(x => !x.parentId).indexOf(c) + 1
          const replies = list.filter(x => x.parentId === c.id)
          return (
            <li key={c.id} className={(selected === c.id ? 'sel ' : '') + (c.resolved ? 'done' : '')}>
              <button className="pinno" onClick={() => go(c)} aria-label={`מעבר להערה ${n}`}>{n}</button>
              <div className="body">
                <div className="meta"><b>{c.authorName}</b> · {floorName(c.floor)} · {when(c.createdAt)}</div>
                <p>{c.body}</p>
                {replies.map(r => <div key={r.id} className="reply"><div className="meta"><b>{r.authorName}</b> · {when(r.createdAt)}</div><p>{r.body}</p></div>)}
                <div className="acts">
                  {meta.can.comment && <button className="btn" onClick={() => setReply({ to: c.id, text: '' })}>תגובה</button>}
                  {meta.can.resolve && <button className="btn" onClick={() => resolve(c)}>{c.resolved ? 'פתיחה מחדש' : 'טופל'}</button>}
                  {((c.mine && !!meta.viewer.role) || meta.viewer.role === 'owner' || meta.viewer.role === 'admin') && <button className="btn" onClick={() => remove(c)}>מחיקה</button>}
                </div>
                {reply?.to === c.id && (
                  <form className="compose" onSubmit={async e => { e.preventDefault(); if (reply.text.trim() && (await post(reply.text.trim(), c, c.id))) setReply(null) }}>
                    <textarea autoFocus rows={2} maxLength={2000} value={reply.text} onChange={e => setReply({ ...reply, text: e.target.value })} />
                    <div className="row2"><button className="btn primary" disabled={busy || !reply.text.trim()}>שליחה</button><button type="button" className="btn" onClick={() => setReply(null)}>ביטול</button></div>
                  </form>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {meta.can.comment && list.length === 0 && <p className="fine">אין עדיין הערות. לחצו על "הערה חדשה" ואז על המקום בבית.</p>}
      {resolvedCount > 0 && <button className="btn" onClick={() => setShowResolved(s => !s)}>{showResolved ? 'הסתרת הערות שטופלו' : `הצגת ${resolvedCount} הערות שטופלו`}</button>}
    </section>
  )
}

/** Numbered pins over the canvas, moved every frame straight in the DOM (no React render per frame). */
export function CommentPins({ viewer, comments, floor, mode, selected, onSelect }: {
  viewer: Viewer; comments: Comment[]; floor: StoreyId; mode: string; selected: string | null; onSelect: (c: Comment) => void
}) {
  const roots = comments.filter(c => !c.parentId)
  const shown = roots.filter(c => !c.resolved && (mode === 'outside' || c.floor === floor))
  const refs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => {
    const place = () => {
      for (const c of shown) {
        const el = refs.current.get(c.id); if (!el) continue
        const s = viewer.toScreen(c)
        el.style.visibility = s.visible ? 'visible' : 'hidden'
        el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`
      }
    }
    place()
    return viewer.on('frame', place)
  }, [viewer, shown])
  return (
    <div className="pins" aria-hidden={shown.length === 0}>
      {shown.map(c => (
        <button key={c.id} ref={el => { if (el) refs.current.set(c.id, el); else refs.current.delete(c.id) }}
          className={'pin' + (selected === c.id ? ' sel' : '')} onClick={() => onSelect(c)} aria-label={`הערה ${roots.indexOf(c) + 1}: ${c.body.slice(0, 60)}`}>
          {roots.indexOf(c) + 1}
        </button>
      ))}
    </div>
  )
}
