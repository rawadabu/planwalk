import { useCallback, useEffect, useRef, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { House, StoreyId } from '@planwalk/house'
import { PX_PER_CM } from '@planwalk/design'

interface Stop { floor: StoreyId; x: number; y: number; yaw: number; name: string; dims: string; floorName: string }
const HOLD = 4.2, FADE = 380

/** Every indoor room worth showing, ground floor up: stand a quarter in from one end, look down the long side. */
export function tourStops(house: House): Stop[] {
  const out: Stop[] = []
  for (const f of [0, 1, 2] as StoreyId[]) {
    const fl = house.floors[f]
    fl.rooms.slice(0, fl.indoor).forEach(r => {
      const x1 = Math.max(r[2], 105), y1 = Math.max(r[3], 105), x2 = Math.min(r[4], 1040), y2 = Math.min(r[5], 1460)
      const w = (x2 - x1) / PX_PER_CM, h = (y2 - y1) / PX_PER_CM
      if (w * h < 3.5e4 || Math.min(w, h) < 130) return                     // skip cupboards, WCs and corridors under 1.3 m
      const alongX = w >= h
      const x = alongX ? x1 + (x2 - x1) * .22 : (x1 + x2) / 2, y = alongX ? (y1 + y2) / 2 : y1 + (y2 - y1) * .22
      const yaw = alongX ? -Math.PI / 2 : Math.PI                         // look east (+x) or south (+y)
      const m = /(\d+)\s*[×x]\s*(\d+)/.exec(r[1])
      out.push({ floor: f, x, y, yaw, name: r[0], dims: m ? `${m[1]} × ${m[2]} ס״מ` : `${((w * h) / 1e4).toFixed(1)} מ״ר`, floorName: fl.name })
    })
  }
  return out
}

/** Guided tour (sheet A-12): cut from room to room through a short fade, a slow look around each, name and size on screen. */
export function Tour({ viewer, house, onEnd }: { viewer: Viewer; house: House; onEnd: () => void }) {
  const stops = useRef(tourStops(house)).current
  const [i, setI] = useState(0), [playing, setPlaying] = useState(true), [fade, setFade] = useState(true)
  const t0 = useRef(0), raf = useRef(0)
  const go = useCallback((n: number) => { if (n < 0 || n >= stops.length) { onEnd(); return } setI(n) }, [stops.length, onEnd])

  // arrive: fade to white, jump, fade back, then pan
  useEffect(() => {
    const s = stops[i]; if (!s) return
    setFade(true)
    const a = setTimeout(() => { viewer.goTo(s.floor, s.x, s.y, s.yaw - .35); viewer.look(s.yaw - .35, -.06); t0.current = performance.now(); setFade(false) }, FADE)
    return () => clearTimeout(a)
  }, [i, viewer, stops])

  useEffect(() => {
    const s = stops[i]; if (!s) return
    const tick = (now: number) => {
      if (playing) {
        const k = Math.min(1, (now - t0.current - FADE) / (HOLD * 1000))
        if (k > 0) viewer.look(s.yaw - .35 + .7 * (k * k * (3 - 2 * k)), -.06)
        if (k >= 1) { go(i + 1); return }
      } else t0.current += 16
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [i, playing, viewer, stops, go])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onEnd(); if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) } if (e.key === 'ArrowLeft') go(i + 1); if (e.key === 'ArrowRight') go(i - 1) }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [i, go, onEnd])

  const s = stops[i]
  if (!s) return null
  return (
    <>
      <div className={'tourfade' + (fade ? ' on' : '')} aria-hidden />
      <div className="panel tourcap" role="region" aria-label="סיור מודרך" aria-live="polite">
        <div className="tc-text"><span className="tc-floor">{s.floorName} · {i + 1}/{stops.length}</span><b>{s.name}</b><span className="tc-dims">{s.dims}</span></div>
        <div className="tc-dots" aria-hidden>{stops.map((_, n) => <i key={n} className={n === i ? 'on' : n < i ? 'past' : ''} />)}</div>
        <div className="tc-ctrl">
          <button className="btn" onClick={() => go(i - 1)} aria-label="החדר הקודם" disabled={i === 0}>›</button>
          <button className="btn primary" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'השהיה' : 'המשך'}>{playing ? '❚❚' : '▶'}</button>
          <button className="btn" onClick={() => go(i + 1)} aria-label="החדר הבא">‹</button>
          <button className="btn" onClick={onEnd} aria-label="סיום הסיור">סיום</button>
        </div>
      </div>
    </>
  )
}
