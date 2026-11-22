import { useState } from 'react'
import { Link } from 'react-router'
import type { Viewer, Quality, TimeOfDay } from '@planwalk/engine'
import type { StoreyId } from '@planwalk/house'
import type { ViewerUiState } from './useViewer'
import { useEffect, useRef } from 'react'

const FLOORS: Array<[StoreyId, string]> = [[2, 'שנייה'], [1, 'ראשונה'], [0, 'קרקע']]
const TIMES: Array<[Exclude<TimeOfDay, 'custom'>, string]> = [['morning', 'בוקר'], ['noon', 'צהריים'], ['golden', 'שעת זהב'], ['evening', 'ערב']]
const QUALITIES: Array<[Quality, string]> = [['high', 'גבוהה'], ['medium', 'בינונית'], ['low', 'נמוכה']]

export type Drawer = 'areas' | 'sun' | 'comments' | 'design' | 'kitchen' | 'cost' | 'styles' | null
export function Toolbar({ viewer, ui, measuring, setMeasuring, drawer, setDrawer, commentCount, onTour, open }: { viewer: Viewer; ui: ViewerUiState; measuring: boolean; setMeasuring: (on: boolean) => void; drawer: Drawer; setDrawer: (d: Drawer) => void; commentCount: number; onTour: () => void; open?: boolean }) {
  const toggle = (d: Exclude<Drawer, null>) => setDrawer(drawer === d ? null : d)
  const [headBob, setHeadBob] = useState(true)
  const fps = useFps(viewer)
  return (
    <div className={"panel bar" + (open ? " open" : "")} role="toolbar" aria-label="תצוגה והגדרות">
      <Link className="btn brand" to="/">Planwalk</Link>
      {!location.pathname.startsWith("/s/") && <Link className="btn" to="story">סיפור הבנייה</Link>}
      <span className="sep" />
      <div className="seg" role="group" aria-label="קומה">
        {FLOORS.map(([f, label]) => <button key={f} className="btn" aria-pressed={ui.floor === f} onClick={() => viewer.setFloor(f)}>{label}</button>)}
      </div>
      <span className="sep" />
      <button className="btn" aria-pressed={ui.mode === 'walk' || ui.mode === 'trans'} onClick={() => viewer.setMode('walk')}>הליכה</button>
      <button className="btn" aria-pressed={ui.mode === 'top'} onClick={() => viewer.setMode('top')}>מבט מלמעלה</button>
      <button className="btn" aria-pressed={ui.mode === 'outside'} onClick={() => viewer.setMode('outside')}>מבחוץ</button>
      <button className="btn" onClick={() => viewer.resetView()}>חזרה</button>
      <button className="btn" aria-pressed={measuring} onClick={() => setMeasuring(!measuring)}>מדידה</button>
      <span className="sep" />
      <div className="seg" role="group" aria-label="שעה ביום">
        {TIMES.map(([t, label]) => <button key={t} className="btn" aria-pressed={ui.time === t} onClick={() => viewer.setTime(t)}>{label}</button>)}
        <button className="btn" aria-pressed={drawer === 'sun' || ui.time === 'custom'} onClick={() => toggle('sun')}>שמש אמיתית</button>
      </div>
      <button className="btn" aria-pressed={ui.lights} onClick={() => viewer.setLights(!ui.lights)}>תאורה</button>
      <button className="btn" aria-pressed={headBob} onClick={() => { viewer.setHeadBob(!headBob); setHeadBob(!headBob) }}>תנודת הליכה</button>
      <span className="sep" />
      <button className="btn" onClick={onTour}>סיור</button>
      <button className="btn" aria-pressed={drawer === 'styles'} onClick={() => toggle('styles')}>סגנונות</button>
      <button className="btn" aria-pressed={drawer === 'design'} onClick={() => toggle('design')}>עיצוב</button>
      <button className="btn" aria-pressed={drawer === 'kitchen'} onClick={() => toggle('kitchen')}>מטבח</button>
      <button className="btn" aria-pressed={drawer === 'cost'} onClick={() => toggle('cost')}>עלות</button>
      <button className="btn" aria-pressed={drawer === 'areas'} onClick={() => toggle('areas')}>שטחים</button>
      <button className="btn" aria-pressed={drawer === 'comments'} onClick={() => toggle('comments')}>הערות{commentCount ? ` (${commentCount})` : ''}</button>
      <span className="sep" />
      <div className="seg" role="group" aria-label="איכות תצוגה">
        {QUALITIES.map(([q, label]) => <button key={q} className="btn" aria-pressed={ui.quality === q} onClick={() => viewer.setQuality(q)}>{label}</button>)}
      </div>
      <span className="fps" ref={fps} />
    </div>
  )
}
// frames per second, written to a ref twice a second
function useFps(viewer: Viewer) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let n = 0, t0 = performance.now()
    return viewer.on('pose', () => { n++; const t = performance.now(); if (t - t0 > 500) { if (ref.current) ref.current.textContent = Math.round(n * 1000 / (t - t0)) + ' fps'; n = 0; t0 = t } })
  }, [viewer])
  return ref
}
