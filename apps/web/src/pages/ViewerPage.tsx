import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useViewer } from '../viewer/useViewer'
import { MiniMap } from '../viewer/MiniMap'
import { Toolbar } from '../viewer/Toolbar'
import { MeasureLabel } from '../viewer/MeasureLabel'
import { Joystick } from '../viewer/Joystick'
import { AreasPanel } from '../viewer/Areas'
import { GalleryPanel } from '../viewer/Gallery'
import { DesignPanel, newDesignSession } from '../viewer/DesignPanel'
import { KitchenPanel } from '../viewer/KitchenPanel'
import { CostPanel } from '../viewer/Cost'
import { Tour } from '../viewer/Tour'
import { StylesBar } from '../viewer/Styles'
import { SunPanel } from '../viewer/SunPanel'
import { CommentsPanel, CommentPins, useComments } from '../viewer/Comments'
import { type Drawer } from '../viewer/Toolbar'
import { api, type HouseMeta } from '../api'
import type { House } from '@planwalk/house'
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
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [meta, setMeta] = useState<HouseMeta | null>(null)
  useEffect(() => { api.houseMeta(houseId, share).then(setMeta).catch(() => setMeta(null)) }, [houseId, share])
  const comments = useComments(houseId, share, meta)
  const [selected, setSelected] = useState<string | null>(null)
  // the house as edited in design mode (walls moved, windows resized); the area table and minimap follow it
  const [edited, setEdited] = useState<House | null>(null)
  const shown = edited ?? ui.house
  const design = useRef(newDesignSession())
  const [touring, setTouring] = useState(false), [moreOpen, setMoreOpen] = useState(false), [, bump] = useState(0)
  // tap the floor to walk there (not while choosing things in Design or placing a comment)
  useEffect(() => {
    if (!viewer) return
    return viewer.on('tap', e => {
      if (measuring || touring || drawer === 'design' || drawer === 'comments' || ui.mode !== 'walk') return
      const h = viewer.pick(e.clientX, e.clientY)
      if (h && h.h < .15 && h.floor === ui.floor) viewer.teleport(h.x, h.y)
    })
  }, [viewer, measuring, touring, drawer, ui.mode, ui.floor])
  const openCount = comments.list.filter(c => !c.parentId && !c.resolved).length

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
          <MiniMap viewer={viewer} house={shown!} houseId={houseId} floor={ui.floor} room={ui.room} share={share} />
          {ui.nearStair && ui.mode === 'walk' && (
            <div className="panel stairs" role="group" aria-label="מדרגות">
              <span className="lbl2">מדרגות</span>
              {ui.floor < 2 && <button className="btn primary" onClick={() => viewer.climb(1)}>עלייה לקומה למעלה ↑</button>}
              {ui.floor > 0 && <button className="btn primary" onClick={() => viewer.climb(-1)}>ירידה לקומה למטה ↓</button>}
            </div>
          )}
          {measuring && <div className="panel mhint">מדידה: לחץ על שתי נקודות ברצפה</div>}
          <MeasureLabel viewer={viewer} />
          <CommentPins viewer={viewer} comments={comments.list} floor={ui.floor} mode={ui.mode} selected={selected} onSelect={c => { setSelected(c.id); setDrawer('comments') }} />
          {drawer === 'design' && meta && <DesignPanel viewer={viewer} house={ui.house} houseId={houseId} meta={meta} floor={ui.floor} onClose={() => setDrawer(null)} onHouse={setEdited} session={design.current} onCost={() => setDrawer('cost')} />}
          {drawer === 'kitchen' && <KitchenPanel viewer={viewer} house={ui.house} houseId={houseId} prices={meta?.prices} session={design.current} onHouse={setEdited} onClose={() => setDrawer(null)} onCost={() => setDrawer('cost')} />}
          {drawer === 'styles' && <StylesBar viewer={viewer} house={ui.house} session={design.current} prices={meta?.prices} onHouse={setEdited} onClose={() => setDrawer(null)} onChanged={() => bump(n => n + 1)} />}
          {touring && <Tour viewer={viewer} house={shown!} onEnd={() => setTouring(false)} />}
          {drawer === 'cost' && <CostPanel house={ui.house} houseId={houseId} design={design.current.doc.design} prices={meta?.prices as never} onClose={() => setDrawer(null)} />}
          {drawer === 'areas' && <AreasPanel house={shown!} floor={ui.floor} onClose={() => setDrawer(null)} />}
          {drawer === 'photos' && <GalleryPanel houseId={houseId} share={share} onClose={() => setDrawer(null)} />}
          {drawer === 'sun' && meta && <SunPanel viewer={viewer} meta={meta} onClose={() => setDrawer(null)} />}
          {drawer === 'comments' && meta && <CommentsPanel viewer={viewer} house={ui.house} houseId={houseId} share={share} meta={meta} floor={ui.floor} state={comments} selected={selected} setSelected={setSelected} onClose={() => setDrawer(null)} />}
          <Toolbar viewer={viewer} ui={ui} measuring={measuring} setMeasuring={setMeasuring} drawer={drawer} setDrawer={d => { setDrawer(d); setMoreOpen(false) }} commentCount={openCount} onTour={() => { setDrawer(null); setTouring(true); setMoreOpen(false) }} open={moreOpen} />
          <nav className="mbar" aria-label="פעולות עיקריות">
            <button onClick={() => { setDrawer(null); setTouring(true) }}><b>▶</b>סיור</button>
            <button aria-pressed={drawer === 'styles'} onClick={() => setDrawer(drawer === 'styles' ? null : 'styles')}><b>◐</b>סגנון</button>
            <button aria-pressed={drawer === 'sun'} onClick={() => setDrawer(drawer === 'sun' ? null : 'sun')}><b>☀</b>שעה</button>
            <button onClick={() => viewer.setFloor(((ui.floor + 1) % 3) as 0 | 1 | 2)}><b>⇅</b>{ui.house.floors[((ui.floor + 1) % 3) as 0 | 1 | 2].name}</button>
            <button aria-pressed={moreOpen} onClick={() => setMoreOpen(o => !o)}><b>⋯</b>עוד</button>
          </nav>
          <div className="panel hint">הליכה: <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> או חיצים · גרירה כדי להסתכל · <kbd>Shift</kbd> מהר יותר</div>
          <Joystick viewer={viewer} />
        </>
      )}
    </div>
  )
}
