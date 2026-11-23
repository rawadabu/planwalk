import { useEffect, useRef, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import { parseHouse, type House } from '@planwalk/house'
import { api, type PlanChange, type Versions } from '../api'
import { renderDesign, type DesignSession } from './DesignPanel'

type Rect = [number, number, number, number]
const KINDS = [['room', 'חדרים'], ['wall', 'קירות'], ['opening', 'חלונות ודלתות']] as const
const date = (s: string) => new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })

/** Where to stand to look at a change: inside the nearest room, a couple of metres back, facing it. */
function standFor(house: House, c: PlanChange): { x: number; y: number; yaw: number } {
  const fl = house.floors[c.storey], tx = (c.rect[0] + c.rect[2]) / 2, ty = (c.rect[1] + c.rect[3]) / 2
  const rooms = fl.rooms.slice(0, fl.indoor)
  // room boxes can overlap (an L-shaped room's box covers its neighbour): the smallest box at a point is the room there
  const size = (r: (typeof rooms)[number]) => (r[4] - r[2]) * (r[5] - r[3])
  const inside = (x: number, y: number) => rooms.filter(r => x >= r[2] && x < r[4] && y >= r[3] && y < r[5]).sort((a, b) => size(a) - size(b))[0]
  if (c.kind === 'room') {
    const room = rooms.find(r => r[2] === c.rect[0] && r[3] === c.rect[1]) ?? inside(tx, ty)
    if (!room) return { x: tx, y: ty, yaw: Math.PI }
    const wide = room[4] - room[2] >= room[5] - room[3]
    return { x: wide ? room[2] + 70 : (room[2] + room[4]) / 2, y: wide ? (room[3] + room[5]) / 2 : room[3] + 70, yaw: wide ? -Math.PI / 2 : Math.PI }
  }
  // a wall or an opening: from the largest room beside it, far enough back to see it with the room around it
  const horizontal = c.rect[2] - c.rect[0] >= c.rect[3] - c.rect[1]
  const near = new Set<(typeof rooms)[number]>()
  for (const d of [30, 80, 140]) for (const r of horizontal ? [inside(tx, c.rect[1] - d), inside(tx, c.rect[3] + d)] : [inside(c.rect[0] - d, ty), inside(c.rect[2] + d, ty)]) if (r) near.add(r)
  const room = [...near].sort((a, b) => size(b) - size(a))[0]
  if (!room) return { x: tx, y: ty, yaw: Math.PI }
  // step straight back from the wall into that room
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  let x = tx, y = ty
  if (horizontal) y = (room[3] + room[5]) / 2 > ty ? Math.min(c.rect[3] + 300, room[5] - 60) : Math.max(c.rect[1] - 300, room[3] + 60)
  else x = (room[2] + room[4]) / 2 > tx ? Math.min(c.rect[2] + 300, room[4] - 60) : Math.max(c.rect[0] - 300, room[2] + 60)
  x = clamp(x, room[2] + 40, room[4] - 40); y = clamp(y, room[3] + 40, room[5] - 40)
  return { x, y, yaw: Math.atan2(-(tx - x), -(ty - y)) }
}

/**
 * "What's new in the plan": shown to a client the first time they open the house after the architect published an
 * update. The architect's note, every change (tap one to be taken there), a before / after switch, and an honest
 * list of the client's own choices that no longer fit.
 */
export function VersionsPanel({ viewer, house, houseId, share, session, isClient, onHouse, onMark, onSeen, onClose }: {
  viewer: Viewer; house: House; houseId: string; share?: string; session: DesignSession; isClient: boolean
  onHouse: (h: House | null) => void; onMark: (m: { storey: number; rect: Rect } | null) => void; onSeen: () => void; onClose: () => void
}) {
  const [data, setData] = useState<Versions | null>(null), [error, setError] = useState<string | null>(null)
  const [n, setN] = useState<number | null>(null), [side, setSide] = useState<'after' | 'before'>('after'), [picked, setPicked] = useState<number | null>(null), [busy, setBusy] = useState(false)
  const prev = useRef(new Map<number, House>())
  useEffect(() => { api.versions(houseId, share).then(d => { setData(d); setN(d.current) }).catch(e => setError(e.message)) }, [houseId, share])

  const showAfter = () => { session.shownEdits = ''; session.shownGeo = ''; renderDesign(viewer, house, session, onHouse, session.doc.design) }
  const show = async (which: 'after' | 'before') => {
    if (which === side || !n) return
    if (which === 'after') { showAfter(); setSide('after'); return }
    setBusy(true)
    try {
      let old = prev.current.get(n - 1)
      if (!old) { const r = await fetch(api.versionUrl(houseId, n - 1, share), { credentials: 'include' }); if (!r.ok) throw new Error('הגרסה הקודמת לא נשמרה'); old = parseHouse(await r.json()); prev.current.set(n - 1, old) }
      viewer.setHouse(old); viewer.applyDesign({}, []); onHouse(old); setSide('before')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  // leaving the panel always returns to the current plan
  const sideRef = useRef(side); sideRef.current = side
  useEffect(() => () => { if (sideRef.current === 'before') showAfter(); onMark(null) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const v = data?.versions.find(x => x.number === n) ?? null
  const go = (c: PlanChange, i: number) => {
    setPicked(i); onMark({ storey: c.storey, rect: c.rect })
    const src = side === 'before' ? prev.current.get((n ?? 1) - 1) ?? house : house, p = standFor(src, c)
    viewer.goTo(c.storey, p.x, p.y, p.yaw); viewer.look(p.yaw, -.04)
  }
  const seen = async () => { try { await api.markSeen(houseId) } catch { /* shown again next time */ } onSeen(); onClose() }
  const latest = !!data && n === data.current, canCompare = !!v && v.number > 1 && latest

  return (
    <section className="panel drawer versions" aria-label="מה חדש בתוכנית">
      <header><h2>{latest ? 'מה חדש בתוכנית' : `גרסה ${n}`}</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      {error && <p className="warnline" role="alert">{error}</p>}
      {!data ? <p className="fine">טוען…</p> : !v ? <p className="fine">זו הגרסה הראשונה של התוכנית.</p> : (
        <>
          <p className="vmeta">גרסה {v.number} · {date(v.createdAt)}{v.by ? ` · ${v.by}` : ''}</p>
          {v.note && <blockquote dir="auto">{v.note}</blockquote>}
          {canCompare && (
            <div className="seg ba" role="group" aria-label="השוואה">
              <button className="btn" aria-pressed={side === 'before'} disabled={busy} onClick={() => show('before')}>לפני · גרסה {v.number - 1}</button>
              <button className="btn" aria-pressed={side === 'after'} disabled={busy} onClick={() => show('after')}>אחרי · גרסה {v.number}</button>
            </div>
          )}
          {side === 'before' && <p className="fine">אתם רואים את התוכנית הקודמת, בלי הבחירות שלכם. לחצו "אחרי" כדי לחזור.</p>}
          {!v.changes ? <p className="fine">{v.number === 1 ? 'זו הגרסה הראשונה של התוכנית.' : 'אין פירוט שינויים לגרסה הזו.'}</p> : v.changes.changes.length === 0 ? <p className="fine">התוכנית עודכנה, בלי שינוי בחדרים, בקירות או בפתחים.</p> : (
            <>
              {v.changes.area.before !== v.changes.area.after && <p className="fine">שטח הבית: {v.changes.area.before} ← {v.changes.area.after} מ"ר</p>}
              {KINDS.filter(([k]) => v.changes!.counts[k]).map(([k, label]) => (
                <div key={k} className="chg">
                  <h3>{label} <small>{v.changes!.counts[k]}</small></h3>
                  <ul>{v.changes!.changes.map((c, i) => c.kind !== k ? null : <li key={i}><button className={picked === i ? 'on' : ''} onClick={() => go(c, i)} disabled={!latest}><b>{c.where}</b> {c.what}<span aria-hidden="true">הצג ←</span></button></li>)}</ul>
                </div>
              ))}
            </>
          )}
          {v.dropped.length > 0 && (
            <div className="dropped">
              <h3>{isClient ? 'מהבחירות שלכם' : 'בחירות של לקוחות'}: {v.dropped.length} לא התאימו לתוכנית החדשה</h3>
              <ul>{v.dropped.map((d, i) => <li key={i}>{d}</li>)}</ul>
              <p className="fine">כל שאר הבחירות וההערות נשמרו כמו שהן.</p>
            </div>
          )}
          {latest && v.number > 1 && v.dropped.length === 0 && isClient && <p className="fine">הבחירות וההערות שלכם נשמרו כמו שהן.</p>}
        </>
      )}
      {data && isClient && data.seen < data.current && latest && <button className="btn primary" onClick={seen}>ראיתי, תודה</button>}
      {data && data.versions.length > 1 && (
        <div className="vlist">
          <h3>כל הגרסאות</h3>
          <ul>{data.versions.map(x => <li key={x.number}><button className={x.number === n ? 'on' : ''} onClick={() => { if (side === 'before') { showAfter(); setSide('after') } setPicked(null); onMark(null); setN(x.number) }}>גרסה {x.number} · {date(x.createdAt)}{x.changes ? ` · ${x.changes.changes.length} שינויים` : ''}</button></li>)}</ul>
        </div>
      )}
    </section>
  )
}
