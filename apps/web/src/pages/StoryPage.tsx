import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { createViewer, type Viewer } from '@planwalk/engine'
import { api, STATIC } from '../api'
import '../styles/story.css'

// Must match the engine's story timing (world/Story.ts)
const EXTERIOR_END = 0.84
const STAGES = [
  { eyebrow: '01 · התוכנית', title: 'הכול מתחיל בשרטוט.', text: 'כל קיר עולה ישירות מהתוכנית של האדריכל, באותן מידות בדיוק.' },
  { eyebrow: '02 · יסודות', title: 'רצפת הקרקע.', text: 'הרצפה במקום ובגודל שבתוכנית.' },
  { eyebrow: '03 · שלד', title: 'בטון, קומה אחר קומה.', text: 'עמודים ותקרות. החלל הכפול בסלון נשאר פתוח.' },
  { eyebrow: '04 · בנייה', title: 'הקירות נסגרים.', text: 'בלוקים בדיוק במקום שבו הם מסומנים בתוכנית.' },
  { eyebrow: '05 · חלונות', title: 'האור נכנס.', text: 'כל פתח בגודל ובגובה שבתוכנית.' },
  { eyebrow: '06 · מוכן', title: 'הבית שלכם.', text: 'טיח, גינה, ריהוט, ושמש שנכנסת מהחלונות האמיתיים.' },
]
const CABINETS: Array<[string, string, string]> = [['walnut', 'אגוז', '#8a5a3c'], ['oak', 'אלון', '#d9bf97'], ['navy', 'כחול', '#22355c'], ['sage', 'מרווה', '#8b9a80'], ['white', 'לבן', '#f1ede6']]
const FLOORS: Array<[string, string, string]> = [['tile', 'אריח בהיר', '#e9e3da'], ['oak', 'פרקט אלון', '#d2b48e'], ['concrete', 'בטון', '#b9b4ac']]

/** Scroll story: the house builds itself from its plan, then you choose finishes inside. */
export default function StoryPage() {
  const { houseId = 'twin-a' } = useParams()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null), railRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [progress, setProgress] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [cab, setCab] = useState('walnut'), [floor, setFloor] = useState('tile')
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    let v: Viewer
    try { v = createViewer({ canvas, houseUrl: api.houseUrl(houseId), libraryUrl: api.libraryUrl, manualRender: new URLSearchParams(location.search).has('test') }) }
    catch { setError('הדפדפן הזה לא תומך בתלת־ממד (WebGL).'); return }
    v.on('progress', (a, b) => setProgress(a / b))
    v.on('ready', h => { setTitle(h.title); setReady(true); v.setStory(scrollT()) })
    v.on('error', setError)
    setViewer(v); (window as unknown as { __viewer?: Viewer }).__viewer = v
    return () => { v.destroy(); setViewer(null) }
  }, [houseId])
  useEffect(() => { document.title = title ? `${title} · סיפור הבנייה · Planwalk` : 'Planwalk' }, [title])

  // scroll → story progress (high-frequency: straight to the engine and the DOM, React only on stage changes)
  useEffect(() => {
    if (!viewer || !ready) return
    const onScroll = () => {
      const t = scrollT()
      viewer.setStory(t)
      const cut = Math.max(0, 1 - Math.abs(t - (EXTERIOR_END + .03)) / .03)
      if (fadeRef.current) fadeRef.current.style.opacity = String(cut)
      if (railRef.current) railRef.current.style.transform = `scaleY(${t})`
      const s = t >= EXTERIOR_END + .02 ? STAGES.length : Math.min(STAGES.length - 1, Math.floor(t / EXTERIOR_END * STAGES.length))
      setStage(prev => (prev === s ? prev : s))
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [viewer, ready])

  const pick = (slot: 'cabinets' | 'floor', o: string) => { viewer?.setFinish(slot, o); slot === 'cabinets' ? setCab(o) : setFloor(o) }
  const goStage = (i: number) => {
    const max = document.documentElement.scrollHeight - innerHeight
    const t = i >= STAGES.length ? 0.95 : (i + .55) / STAGES.length * EXTERIOR_END
    scrollTo({ top: t * max, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  return (
    <div className="story" dir="rtl">
      <canvas ref={canvasRef} className="story-stage" aria-label="הבית נבנה שלב אחר שלב מתוך התוכנית" />
      <div ref={fadeRef} className="story-fade" aria-hidden />
      <header className="story-top">
        <Link to="/" className="story-brand">Planwalk</Link>
        <span className="story-house">{title}</span>
        <Link to={STATIC ? `/h/${houseId}` : `/h/${houseId}`} className="story-cta">כניסה לבית ←</Link>
      </header>
      <div className="story-rail" role="navigation" aria-label="שלבים">
        <div className="track"><i ref={railRef} /></div>
        {[...STAGES.map(s => s.eyebrow.split(' · ')[1]), 'עיצוב'].map((n, i) => (
          <button key={n} className={i === stage ? 'on' : ''} onClick={() => goStage(i)} aria-current={i === stage ? 'step' : undefined}>{n}</button>
        ))}
      </div>
      {!ready && !error && <div className="story-load" role="status">בונים את הבית…<div className="bar"><i style={{ transform: `scaleX(${progress})` }} /></div></div>}
      {error && <div className="story-load" role="alert">{error}</div>}

      {/* one caption at a time, fixed; the sections below are only scroll distance */}
      {ready && stage < STAGES.length && (
        <div className="story-caption" key={stage} aria-live="polite">
          <div className="eyebrow">{STAGES[stage].eyebrow}</div>
          <h2>{STAGES[stage].title}</h2>
          <p>{STAGES[stage].text}</p>
        </div>
      )}
      {ready && stage === STAGES.length && (
        <div className="story-caption wide" aria-label="בחירת גימורים">
          <div className="eyebrow">07 · שלכם</div>
          <h2>תעצבו אותו.</h2>
          <p>בחרו גימור, והמטבח מתעדכן מולכם.</p>
          <div className="opts" role="group" aria-label="ארונות">
            <span className="lbl">ארונות</span>
            {CABINETS.map(([k, n, c]) => <button key={k} aria-pressed={cab === k} onClick={() => pick('cabinets', k)}><i style={{ background: c }} />{n}</button>)}
          </div>
          <div className="opts" role="group" aria-label="רצפה">
            <span className="lbl">רצפה</span>
            {FLOORS.map(([k, n, c]) => <button key={k} aria-pressed={floor === k} onClick={() => pick('floor', k)}><i style={{ background: c }} />{n}</button>)}
          </div>
          <Link to={`/h/${houseId}`} className="story-go">להיכנס ולהסתובב בבית</Link>
        </div>
      )}
      <main className="story-scroll" aria-hidden>
        {STAGES.map((_, i) => <section key={i} className="story-step" />)}
        <section className="story-step" />
        <section className="story-step" />
      </main>
    </div>
  )
}
function scrollT() {
  const max = document.documentElement.scrollHeight - innerHeight
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0
}
