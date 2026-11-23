import { useEffect, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { House } from '@planwalk/house'
import { DEFAULT_BRIEF, STYLES, finish, firstDesign, parseBrief, type Brief } from '@planwalk/design'
import { api, STATIC, type HouseMeta } from '../api'
import { renderDesign, type DesignSession } from './DesignPanel'

const key = (houseId: string) => `planwalk.brief.${houseId}`
export function storedBrief(houseId: string): Brief | null { try { const v = localStorage.getItem(key(houseId)); return v ? parseBrief(JSON.parse(v)) : null } catch { return null } }

const ACCENTS: Array<[Brief['accent'], string]> = [['none', 'בלי צבע'], ['sage', 'ירוק מרווה'], ['clay', 'טרקוטה רכה'], ['mist-blue', 'כחול ערפל'], ['charcoal', 'פחם']]
const FLOORS: Array<[Brief['floor'], string]> = [['style', 'לפי הסגנון'], ['wood', 'פרקט עץ'], ['tile', 'אריחים']]
const LIVING: Array<[Brief['living'][number], string]> = [['tv', 'טלוויזיה'], ['reading', 'ספרים וקריאה'], ['plants', 'צמחים']]
const OUTDOOR: Array<[Brief['outdoor'][number], string]> = [['dining', 'ארוחות בחוץ'], ['lounge', 'שיזוף ומנוחה'], ['green', 'עצים וצמחייה'], ['bbq', 'מנגל']]
const LEVELS: Array<[Brief['level'], string, string]> = [['minimal', 'מינימלי', 'רק הבסיס'], ['cozy', 'ביתי', 'בית שגרים בו'], ['full', 'מלא', 'מרוהט עד הסוף']]

/**
 * The design questionnaire: a handful of answers, and the home is dressed from them (finishes, furniture, rugs, light,
 * plants, balconies and the garden), so nobody starts from an empty house. Everything it places can then be moved or
 * removed like any other piece.
 */
export function BriefPanel({ viewer, house, houseId, meta, session, onHouse, onClose, onChanged }: { viewer: Viewer; house: House; houseId: string; meta: HouseMeta | null; session: DesignSession; onHouse: (h: House) => void; onClose: () => void; onChanged: () => void }) {
  const [b, setB] = useState<Brief>(() => storedBrief(houseId) ?? DEFAULT_BRIEF)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState<number | null>(null)
  const member = !STATIC && !!meta?.viewer.role
  // the answers saved on the server win over this browser's copy
  useEffect(() => { if (member) api.brief(houseId).then(r => { if (r.brief) setB(parseBrief(r.brief)) }).catch(() => {}) }, [member, houseId])
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setB(x => ({ ...x, [k]: v }))
  const toggle = <K extends 'living' | 'outdoor'>(k: K, v: Brief[K][number]) => setB(x => ({ ...x, [k]: (x[k] as string[]).includes(v) ? (x[k] as string[]).filter(y => y !== v) : [...x[k], v] } as Brief))
  const doc = session.doc
  const has = Object.keys(doc.design.finishes).length + Object.keys(doc.design.edits).length > 0

  const make = async () => {
    setBusy(true); setError(null)
    try {
      const d = firstDesign(house, b)
      // one undo step: everything chosen so far gives way to the first design
      const ops = [
        ...Object.keys(doc.design.finishes).filter(k => !(k in d.finishes)).map(k => ({ target: k, id: null })), ...Object.entries(d.finishes).map(([k, id]) => ({ target: k, id })),
        ...Object.keys(doc.design.edits).filter(k => !(k in d.edits)).map(k => ({ target: 'edit:' + k, id: null })), ...Object.entries(d.edits).map(([k, e]) => ({ target: 'edit:' + k, id: JSON.stringify(e) })),
      ]
      doc.apply(ops)
      renderDesign(viewer, house, session, onHouse, doc.design); onChanged()
      try { localStorage.setItem(key(houseId), JSON.stringify(b)) } catch { /* private mode */ }
      if (member) {
        await api.saveBrief(houseId, b)
        let a = session.active
        if (!a) { const c = await api.createDesign(houseId, { name: 'העיצוב הראשון שלי' }); a = { id: c.id, name: c.name, version: c.version } }
        const s = await api.saveDesign(a.id, { version: a.version, data: doc.design })
        session.active = { ...a, version: s.version }; doc.markSaved(); onChanged()
      }
      setDone(Object.values(d.edits).filter(e => e.k === 'add').length)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (done !== null) return (
    <section className="panel brief" aria-label="שאלון עיצוב">
      <header><h2>הבית מעוצב</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <p className="lead">סידרנו {done} פריטים לפי התשובות שלכם: ריהוט, שטיחים, תאורה, צמחים, מרפסות וגינה. זו נקודת פתיחה. כל פריט אפשר להזיז, לסובב או להסיר ב״ריהוט וגינה״, וכל חומר להחליף ב״עיצוב״.</p>
      <div className="row"><button className="btn primary" onClick={onClose}>לסיור בבית</button><button className="btn" onClick={() => setDone(null)}>לשנות תשובות</button></div>
    </section>
  )
  return (
    <section className="panel brief" aria-label="שאלון עיצוב">
      <header><h2>איך אתם רוצים את הבית?</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <p className="lead">כמה שאלות קצרות, ונכין לכם עיצוב ראשון לכל הבית. אפשר לשנות הכול אחר כך.</p>

      <fieldset><legend>סגנון</legend>
        <div className="styles">{STYLES.map(s => (
          <button key={s.id} type="button" className={'scard' + (b.style === s.id ? ' on' : '')} aria-pressed={b.style === s.id} onClick={() => set('style', s.id as Brief['style'])}>
            <span className="sw">{s.swatch.map(c => <i key={c} style={{ background: c }} />)}</span><b>{s.he}</b><span className="blurb">{s.blurb}</span>
          </button>
        ))}</div>
      </fieldset>
      <fieldset><legend>צבע לקירות חדרי השינה</legend>
        <div className="chips">{ACCENTS.map(([v, label]) => <button key={v} type="button" className="bchip" aria-pressed={b.accent === v} onClick={() => set('accent', v)}>{v !== 'none' && <i style={{ background: finish(`paint-${v}`)?.look.color }} />}{label}</button>)}</div>
      </fieldset>
      <fieldset><legend>רצפה</legend>
        <div className="chips">{FLOORS.map(([v, label]) => <button key={v} type="button" className="bchip" aria-pressed={b.floor === v} onClick={() => set('floor', v)}>{label}</button>)}</div>
      </fieldset>
      <fieldset><legend>מי גר בבית</legend>
        <div className="chips">
          <span className="stepper"><span id="bk">ילדים</span><button type="button" className="btn" aria-label="פחות ילדים" onClick={() => set('kids', Math.max(0, b.kids - 1))}>−</button><b aria-labelledby="bk">{b.kids}</b><button type="button" className="btn" aria-label="יותר ילדים" onClick={() => set('kids', Math.min(8, b.kids + 1))}>+</button></span>
          <button type="button" className="bchip" aria-pressed={b.workFromHome} onClick={() => set('workFromHome', !b.workFromHome)}>עובדים מהבית</button>
        </div>
      </fieldset>
      <fieldset><legend>בסלון חשוב לנו</legend>
        <div className="chips">{LIVING.map(([v, label]) => <button key={v} type="button" className="bchip" aria-pressed={b.living.includes(v)} onClick={() => toggle('living', v)}>{label}</button>)}</div>
      </fieldset>
      <fieldset><legend>בגינה ובמרפסות</legend>
        <div className="chips">{OUTDOOR.map(([v, label]) => <button key={v} type="button" className="bchip" aria-pressed={b.outdoor.includes(v)} onClick={() => toggle('outdoor', v)}>{label}</button>)}</div>
      </fieldset>
      <fieldset><legend>כמה מרוהט</legend>
        <div className="chips">{LEVELS.map(([v, label, sub]) => <button key={v} type="button" className="bchip two" aria-pressed={b.level === v} onClick={() => set('level', v)}><b>{label}</b><small>{sub}</small></button>)}</div>
      </fieldset>
      <label className="field" htmlFor="brief-note">משהו שחשוב שהאדריכל ידע <small>(לא חובה)</small>
        <textarea id="brief-note" rows={2} maxLength={1000} value={b.note ?? ''} onChange={e => set('note', e.target.value)} placeholder="למשל: אוהבים הרבה אור, צריכים מקום לפסנתר" />
      </label>
      {has && <p className="warnline">העיצוב הראשון יחליף את הבחירות הנוכחיות. אפשר לבטל את זה ב״ריהוט וגינה״ ← ביטול.</p>}
      {error && <p className="warnline" role="alert">{error}</p>}
      <div className="row"><button className="btn primary" disabled={busy} onClick={make}>{busy ? 'מכינים…' : 'הכינו לי עיצוב ראשון'}</button><button className="btn" onClick={onClose}>אחר כך</button></div>
    </section>
  )
}
