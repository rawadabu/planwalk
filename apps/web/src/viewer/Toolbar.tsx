import { useState } from 'react'
import { Link } from 'react-router'
import type { Viewer, Quality, TimeOfDay } from '@planwalk/engine'
import type { StoreyId } from '@planwalk/house'
import type { ViewerUiState } from './useViewer'
import { useEffect, useRef } from 'react'

const FLOORS: Array<[StoreyId, string]> = [[2, 'שנייה'], [1, 'ראשונה'], [0, 'קרקע']]
const TIMES: Array<[TimeOfDay, string]> = [['morning', 'בוקר'], ['noon', 'צהריים'], ['golden', 'שעת זהב'], ['evening', 'ערב']]
const QUALITIES: Array<[Quality, string]> = [['high', 'גבוהה'], ['medium', 'בינונית'], ['low', 'נמוכה']]

export function Toolbar({ viewer, ui, measuring, setMeasuring }: { viewer: Viewer; ui: ViewerUiState; measuring: boolean; setMeasuring: (on: boolean) => void }) {
  const [headBob, setHeadBob] = useState(true)
  const fps = useFps(viewer)
  return (
    <div className="panel bar" role="toolbar" aria-label="תצוגה והגדרות">
      <Link className="btn brand" to="/">Planwalk</Link>
      <span className="sep" />
      <div className="seg" role="group" aria-label="קומה">
        {FLOORS.map(([f, label]) => <button key={f} className="btn" aria-pressed={ui.floor === f} onClick={() => viewer.setFloor(f)}>{label}</button>)}
      </div>
      <span className="sep" />
      <button className="btn" aria-pressed={ui.mode !== 'top'} onClick={() => viewer.setMode('walk')}>הליכה</button>
      <button className="btn" aria-pressed={ui.mode === 'top'} onClick={() => viewer.setMode('top')}>מבט מלמעלה</button>
      <button className="btn" onClick={() => viewer.resetView()}>חזרה</button>
      <button className="btn" aria-pressed={measuring} onClick={() => setMeasuring(!measuring)}>מדידה</button>
      <span className="sep" />
      <div className="seg" role="group" aria-label="שעה ביום">
        {TIMES.map(([t, label]) => <button key={t} className="btn" aria-pressed={ui.time === t} onClick={() => viewer.setTime(t)}>{label}</button>)}
      </div>
      <button className="btn" aria-pressed={ui.lights} onClick={() => viewer.setLights(!ui.lights)}>תאורה</button>
      <button className="btn" aria-pressed={headBob} onClick={() => { viewer.setHeadBob(!headBob); setHeadBob(!headBob) }}>תנודת הליכה</button>
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
