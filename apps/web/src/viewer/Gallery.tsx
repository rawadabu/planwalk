import { useEffect, useState } from 'react'
import { api, type Render } from '../api'

const STOREY = ['קומת קרקע', 'קומה ראשונה', 'קומה שנייה']

/** Photoreal images of the house, one per room, rendered offline from the very model you walk through. */
export function GalleryPanel({ houseId, share, onClose }: { houseId: string; share?: string; onClose: () => void }) {
  const [list, setList] = useState<Render[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => { let on = true; api.renders(houseId, share).then(l => on && setList(l)).catch(() => on && setList([])); return () => { on = false } }, [houseId, share])
  useEffect(() => {
    if (open === null || !list) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowLeft') setOpen(i => (i === null ? i : (i + 1) % list.length))        // RTL: left is forward
      else if (e.key === 'ArrowRight') setOpen(i => (i === null ? i : (i - 1 + list.length) % list.length))
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [open, list])
  const src = (r: Render) => api.houseFile(houseId, r.file, share)
  const floors = [2, 1, 0].map(f => ({ f, items: (list ?? []).map((r, i) => ({ r, i })).filter(x => x.r.storey === f) })).filter(g => g.items.length)
  return (
    <>
      <section className="panel drawer gallery" aria-label="תמונות">
        <header><h2>תמונות</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
        {list === null && <p className="fine">טוען…</p>}
        {list?.length === 0 && <p className="fine">עדיין אין תמונות מרונדרות לבית הזה.</p>}
        {floors.map(g => (
          <div key={g.f} className="gfloor">
            <h3>{STOREY[g.f]}</h3>
            <div className="ggrid">
              {g.items.map(({ r, i }) => (
                <button key={r.id} className="gthumb" onClick={() => setOpen(i)}>
                  <img src={src(r)} alt={r.name} loading="lazy" />
                  <span>{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!!list?.length && <p className="fine">הדמיות מחושבות מהמודל שבו אתם מסתובבים, עם אור טבעי. ריהוט וחומרים להמחשה.</p>}
      </section>
      {open !== null && list && (
        <div className="glight" role="dialog" aria-modal="true" aria-label={list[open].name} onClick={() => setOpen(null)}>
          <img src={src(list[open])} alt={list[open].name} onClick={e => e.stopPropagation()} />
          <div className="gbar" onClick={e => e.stopPropagation()}>
            <button className="btn" onClick={() => setOpen((open - 1 + list.length) % list.length)} aria-label="הקודמת">→</button>
            <b>{list[open].name}</b><span>{STOREY[list[open].storey]} · {open + 1}/{list.length}</span>
            <button className="btn" onClick={() => setOpen((open + 1) % list.length)} aria-label="הבאה">←</button>
            <button className="btn x" onClick={() => setOpen(null)} aria-label="סגירה">✕</button>
          </div>
        </div>
      )}
    </>
  )
}
