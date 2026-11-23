import { useMemo, useState } from 'react'
import type { House } from '@planwalk/house'
import { changeReport, type PriceBook } from '@planwalk/design'
import { api } from '../api'
import { ils } from './Cost'
import type { DesignSession } from './DesignPanel'

const KINDS = [['wall', 'קירות'], ['window', 'חלונות'], ['kitchen', 'מטבח'], ['furniture', 'ריהוט וגינה'], ['finish', 'חומרים וצבעים']] as const

/**
 * "Send to the architect": everything the client changed against the plan, as one list with the price difference,
 * plus a message. Saves the choices first, so the architect opens exactly what the client saw.
 */
export function SendPanel({ house, houseId, session, prices, notes, onClose, onSaved }: { house: House; houseId: string; session: DesignSession; prices?: Partial<PriceBook> | null; notes: number; onClose: () => void; onSaved: () => void }) {
  const design = session.doc.design
  const report = useMemo(() => changeReport(house, design, prices), [house, design, prices])
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [sent, setSent] = useState(false)
  const n = report.changes.length, diff = report.cost.difference

  const send = async () => {
    setBusy(true); setError(null)
    try {
      // the choices are saved under the client's name before they are sent
      let a = session.active
      if (!a) { const d = await api.createDesign(houseId, { name: 'הבחירות שלי' }); a = { id: d.id, name: d.name, version: d.version } }
      if (!session.active || session.doc.dirty) { const s = await api.saveDesign(a.id, { version: a.version, data: session.doc.design }); a = { ...a, version: s.version } }
      session.active = a; session.doc.markSaved(); onSaved()
      await api.sendFeedback(houseId, { designId: a.id, message: message.trim() || undefined })
      setSent(true)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (sent) return (
    <section className="panel drawer send" aria-label="שליחה לאדריכל">
      <header><h2>נשלח לאדריכל</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <p className="sentok" role="status">האדריכל קיבל את {n ? `${n} השינויים` : 'ההודעה'}{notes ? ` ו-${notes} ההערות` : ''} שלכם. הבחירות נשמרו, ואפשר להמשיך לשנות ולשלוח שוב בכל רגע.</p>
      <button className="btn primary" onClick={onClose}>חזרה לבית</button>
    </section>
  )
  return (
    <section className="panel drawer send" aria-label="שליחה לאדריכל">
      <header><h2>שליחה לאדריכל</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <div className="sum">
        <div><b>{n}</b><span>שינויים בתוכנית</span></div>
        <div className={diff > 0 ? 'up' : ''}><b>{diff > 0 ? '+' : ''}{ils(diff)}</b><span>הפרש מחיר מול הבסיס</span></div>
      </div>
      {n === 0 ? <p className="fine">לא שיניתם דבר בתוכנית. אפשר לשלוח אישור, שאלה או בקשה במילים{notes ? `, יחד עם ${notes} ההערות שהשארתם בבית` : ''}.</p> : (
        KINDS.filter(([k]) => report.counts[k]).map(([k, label]) => (
          <div key={k} className="chg">
            <h3>{label} <small>{report.counts[k]}</small></h3>
            <ul>{report.changes.filter(c => c.kind === k).map((c, i) => <li key={i}><b>{c.where}</b> {c.what}{c.issue ? <em> · {c.issue}</em> : null}</li>)}</ul>
          </div>
        ))
      )}
      {n > 0 && notes > 0 && <p className="fine">וגם {notes} הערות שהשארתם בבית.</p>}
      <label className="field">הודעה לאדריכל <small>(לא חובה)</small>
        <textarea rows={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder="למשל: אהבנו את הסלון. אפשר להגדיל את חדר הילדים?" />
      </label>
      {error && <p className="warnline" role="alert">{error}</p>}
      <button className="btn primary" onClick={send} disabled={busy}>{busy ? 'שולח…' : 'שליחה לאדריכל'}</button>
      <p className="fine">האדריכל יראה בדיוק את מה שאתם רואים עכשיו, ויעדכן אתכם כשהתוכנית מתעדכנת.</p>
    </section>
  )
}
