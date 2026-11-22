import { useEffect, useRef, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { HouseMeta } from '../api'

// Local wall-clock time at the house → the UTC instant. Israel uses its own zone (with DST); elsewhere the browser's.
function zoneFor(lat: number, lng: number) {
  if (lat > 29 && lat < 33.5 && lng > 34 && lng < 36) return 'Asia/Jerusalem'
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
function instant(day: string, hour: number, tz: string) {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, Math.floor(hour), Math.round((hour % 1) * 60))
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map(p => [p.type, p.value]))
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess - (asLocal - guess))
}
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const today = () => new Date().toISOString().slice(0, 10)

/** The real sun for the project's address: pick a day and an hour, or play the whole day. */
export function SunPanel({ viewer, meta, onClose }: { viewer: Viewer; meta: HouseMeta; onClose: () => void }) {
  const loc = meta.location
  const [day, setDay] = useState(today)
  const [hour, setHour] = useState(() => { const n = new Date(); return Math.min(19, Math.max(6, n.getHours() + Math.round(n.getMinutes() / 15) / 4)) })
  const [playing, setPlaying] = useState(false)
  const [sun, setSun] = useState<{ az: number; el: number } | null>(null)
  const raf = useRef(0)

  useEffect(() => {
    if (!loc) return
    setSun(viewer.setSunAt({ date: instant(day, hour, zoneFor(loc.lat, loc.lng)), lat: loc.lat, lng: loc.lng, north: loc.north }))
  }, [viewer, loc, day, hour])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (t: number) => {
      const dt = (t - last) / 1000; last = t
      setHour(h => { const n = h + dt * 1.2; if (n >= 20) { setPlaying(false); return 20 } return n })   // ~12 s for a day
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing])

  return (
    <section className="panel drawer" aria-label="שמש אמיתית">
      <header><h2>שמש לפי כתובת</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      {!loc ? <p className="fine">כדי לראות את השמש האמיתית, הוסיפו כתובת לפרויקט (בעמוד הפרויקט). עד אז אפשר לבחור בוקר, צהריים, שעת זהב או ערב בסרגל.</p> : <>
        <p className="where">{loc.address ?? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`}</p>
        <label className="field">תאריך<input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} /></label>
        <label className="field">שעה <b className="num">{hhmm(hour)}</b>
          <input type="range" min={5} max={20} step={0.25} value={hour} onChange={e => { setPlaying(false); setHour(+e.target.value) }} />
        </label>
        <div className="row2">
          <button className="btn primary" onClick={() => { if (hour >= 19.9) setHour(5.5); setPlaying(p => !p) }}>{playing ? 'עצירה' : 'הצגת כל היום'}</button>
          <button className="btn" onClick={() => setDay(`${new Date().getFullYear()}-06-21`)}>יום ארוך</button>
          <button className="btn" onClick={() => setDay(`${new Date().getFullYear()}-12-21`)}>יום קצר</button>
        </div>
        {sun && <p className="fine num">{sun.el < 0 ? 'השמש מתחת לאופק' : `גובה ${sun.el.toFixed(0)}° · כיוון ${sun.az.toFixed(0)}° מצפון`}</p>}
      </>}
    </section>
  )
}
