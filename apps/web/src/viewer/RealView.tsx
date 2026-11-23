import { useEffect, useRef, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import { api, STATIC, type HouseMeta, type RealView, type RealViews } from '../api'
import type { ViewerUiState } from './useViewer'
import type { DesignSession } from './DesignPanel'

const when = (s: string) => new Date(s).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })

/**
 * "A real picture": the view on screen, sent as it is (exact walls, the client's own furniture and finishes) to an
 * image model that redraws it photorealistically. It takes about a minute; the pictures stay with the house.
 */
export function RealViewPanel({ viewer, houseId, meta, ui, session, onClose }: { viewer: Viewer; houseId: string; meta: HouseMeta | null; ui: ViewerUiState; session: DesignSession; onClose: () => void }) {
  const member = !STATIC && !!meta?.viewer.role
  const [data, setData] = useState<RealViews | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [open, setOpen] = useState<RealView | null>(null)
  const alive = useRef(true)
  const load = () => api.realViews(houseId).then(d => { if (alive.current) setData(d) }).catch(e => { if (alive.current) setError((e as Error).message) })
  useEffect(() => { alive.current = true; if (member) load(); return () => { alive.current = false } }, [member, houseId])   // eslint-disable-line react-hooks/exhaustive-deps
  // while a picture is being made, look again every few seconds
  const pending = !!data?.views.some(v => v.status === 'pending')
  useEffect(() => { if (!pending) return; const t = setInterval(load, 4000); return () => clearInterval(t) }, [pending, houseId])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [open])

  const make = async () => {
    setBusy(true); setError(null)
    try {
      const frame = await viewer.capture(1536)
      if (!frame) throw new Error('הדפדפן לא הצליח לצלם את המבט. נסו שוב.')
      // the frame has the shape of the 3D canvas (the engine turns createImageBitmap off on this page, so the size is read from the canvas)
      const stage = document.querySelector<HTMLCanvasElement>('canvas.stage'), size = { width: stage?.width || 3, height: stage?.height || 2 }
      await api.createRealView(houseId, frame, { room: ui.room?.[0] ?? null, scene: ui.mode === 'walk' || ui.mode === 'trans' ? 'interior' : 'exterior', ...size, designId: session.active?.id })
      await load()
    } catch (e) { setError((e as Error).message) } finally { if (alive.current) setBusy(false) }
  }
  const src = (v: RealView) => api.houseFile(houseId, v.file!)

  return (
    <>
      <section className="panel drawer realview" aria-label="הדמיה אמיתית">
        <header><h2>הדמיה אמיתית</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
        <p className="fine">עמדו במקום שממנו אתם רוצים לראות את הבית, ולחצו. המבט שעל המסך, עם הריהוט והחומרים שבחרתם, יהפוך לתמונה שנראית כמו צילום. זה לוקח כדקה.</p>
        {!member ? <p className="warnline">ההדמיות זמינות אחרי כניסה לחשבון של הבית.</p> : !data ? <p className="fine">טוען…</p> : !data.available ? <p className="warnline">ההדמיות עדיין לא הופעלו בשרת הזה.</p> : (
          <>
            <button className="btn primary" onClick={make} disabled={busy || pending || data.left <= 0}>{busy ? 'מצלם את המבט…' : pending ? 'התמונה בהכנה…' : 'הדמיה מהמבט הזה'}</button>
            <p className="fine quota">{data.left > 0 ? `נשארו ${data.left} הדמיות מתוך ${data.quota} לפרויקט.` : `הפרויקט השתמש בכל ${data.quota} ההדמיות שלו. פנו לאדריכל כדי להוסיף.`}</p>
          </>
        )}
        {error && <p className="warnline" role="alert">{error}</p>}
        {!!data?.views.length && (
          <div className="ggrid">{data.views.map(v => (
            v.status === 'done' && v.file
              ? <button key={v.id} className="gthumb" onClick={() => setOpen(v)}><img src={src(v)} alt={v.room ?? 'הדמיה'} loading="lazy" /><span>{v.room ?? 'הבית'} · {when(v.createdAt)}</span></button>
              : <div key={v.id} className={'gthumb wait' + (v.status === 'failed' ? ' failed' : '')} role="status"><span>{v.status === 'failed' ? `לא הצליח: ${v.error ?? 'נסו שוב'}` : `${v.room ?? 'הבית'} · בהכנה…`}</span></div>
          ))}</div>
        )}
        <p className="fine">זו הדמיה: המבנה, הריהוט והצבעים הם שלכם, אבל פרטי החומרים והנוף שבחלונות הם פרשנות של המודל.</p>
      </section>
      {open && open.file && (
        <div className="glight" role="dialog" aria-modal="true" aria-label={open.room ?? 'הדמיה'} onClick={() => setOpen(null)}>
          <img src={src(open)} alt={open.room ?? 'הדמיה'} onClick={e => e.stopPropagation()} />
          <div className="gbar" onClick={e => e.stopPropagation()}><b>{open.room ?? 'הבית'}</b><span>{when(open.createdAt)}{open.by ? ` · ${open.by}` : ''}</span><button className="btn x" onClick={() => setOpen(null)} aria-label="סגירה">✕</button></div>
        </div>
      )}
    </>
  )
}
