import { useMemo } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { House } from '@planwalk/house'
import { STYLES, costReport, styleOf, withStyle } from '@planwalk/design'
import { renderDesign, type DesignSession } from './DesignPanel'
import { ils } from './Cost'

/** Three complete looks, one tap each, with what each costs for this house (sheet A-12). */
export function StylesBar({ viewer, house, session, prices, onHouse, onClose, onChanged }: {
  viewer: Viewer; house: House; session: DesignSession; prices?: Record<string, unknown> | null; onHouse: (h: House) => void; onClose: () => void; onChanged: () => void
}) {
  const doc = session.doc, current = styleOf(doc.design)
  const totals = useMemo(() => STYLES.map(s => costReport(house, withStyle(doc.design, s), prices as never).total), [house, doc.design, prices])
  const pick = (i: number) => {
    const next = withStyle(doc.design, STYLES[i]).finishes
    const ops = [...Object.keys(doc.design.finishes).filter(k => !(k in next)).map(k => ({ target: k, id: null })), ...Object.entries(next).map(([k, id]) => ({ target: k, id }))]
    if (doc.apply(ops)) { renderDesign(viewer, house, session, onHouse, doc.design); onChanged() }
  }
  return (
    <section className="panel stylesbar" aria-label="סגנונות">
      <header><h2>סגנון לכל הבית</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <div className="cards">
        {STYLES.map((s, i) => (
          <button key={s.id} className={'scard' + (current?.id === s.id ? ' on' : '')} aria-pressed={current?.id === s.id} onClick={() => pick(i)}>
            <span className="sw">{s.swatch.map(c => <i key={c} style={{ background: c }} />)}</span>
            <b>{s.he}</b>
            <span className="blurb">{s.blurb}</span>
            <span className="price">{ils(totals[i])}</span>
          </button>
        ))}
      </div>
      <p className="fine">כל סגנון הוא בחירה של גימורים מהקטלוג, כולל מחיר. אפשר להמשיך לשנות חדר-חדר ב"עיצוב". המחיר כולל מע״מ.</p>
    </section>
  )
}
