import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useViewer } from '../viewer/useViewer'
import { MiniMap } from '../viewer/MiniMap'
import { Toolbar } from '../viewer/Toolbar'
import { MeasureLabel } from '../viewer/MeasureLabel'
import { Joystick } from '../viewer/Joystick'
import '../styles/viewer.css'

// Walkthrough of one house: full-screen canvas (engine) + React HUD (Hebrew, RTL).
export default function ViewerPage({ houseIdOverride, share }: { houseIdOverride?: string; share?: string } = {}) {
  const params = useParams()
  const houseId = houseIdOverride ?? params.houseId ?? 'twin-a'
  const { canvasRef, viewer, ui } = useViewer(houseId, share)
  const [measuring, setMeasuring] = useState(false)
  useEffect(() => { viewer?.setMeasuring(measuring) }, [viewer, measuring])
  useEffect(() => { document.title = ui.house ? `${ui.house.title} · Planwalk` : 'Planwalk' }, [ui.house])
  const floorName = ui.house?.floors[ui.floor].name

  return (
    <div className="viewer">
      <canvas ref={canvasRef} className="stage" aria-label="מודל תלת־ממדי של הבית. אפשר להסתובב בו" />
      {ui.error && <div className="err">{ui.error}</div>}
      {!ui.house && !ui.error && (
        <div className="panel load" role="status">טוען את הבית…<div className="track"><i style={{ transform: `scaleX(${ui.progress})` }} /></div></div>
      )}
      {viewer && ui.house && (
        <>
          <div className="panel roomcard" aria-live="polite">
            <div className="eyebrow">{ui.house.title} · {floorName}</div>
            <div className="row"><span className="rname">{ui.room?.[0] ?? ''}</span><span className="rdim">{ui.room?.[1] ?? ''}</span></div>
            <div className="note">מידות לפי התוכנית {ui.house.source.scale} · גובה תקרה {ui.house.storey.height.toFixed(2)}{ui.house.storey.assumed ? ' (הנחה)' : ''}</div>
          </div>
          <MiniMap viewer={viewer} house={ui.house} houseId={houseId} floor={ui.floor} room={ui.room} share={share} />
          {ui.nearStair && ui.mode === 'walk' && (
            <div className="panel stairs" role="group" aria-label="מדרגות">
              <span className="lbl2">מדרגות</span>
              {ui.floor < 2 && <button className="btn primary" onClick={() => viewer.climb(1)}>עלייה לקומה למעלה ↑</button>}
              {ui.floor > 0 && <button className="btn primary" onClick={() => viewer.climb(-1)}>ירידה לקומה למטה ↓</button>}
            </div>
          )}
          {measuring && <div className="panel mhint">מדידה: לחץ על שתי נקודות ברצפה</div>}
          <MeasureLabel viewer={viewer} />
          <Toolbar viewer={viewer} ui={ui} measuring={measuring} setMeasuring={setMeasuring} />
          <div className="panel hint">הליכה: <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> או חיצים · גרירה כדי להסתכל · <kbd>Shift</kbd> מהר יותר</div>
          <Joystick viewer={viewer} />
        </>
      )}
    </div>
  )
}
