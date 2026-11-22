import { useEffect, useRef } from 'react'
import type { Viewer } from '@planwalk/engine'

// Distance label that follows the measured segment on screen (positioned via ref every frame).
export function MeasureLabel({ viewer }: { viewer: Viewer }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => viewer.on('measure', m => {
    const el = ref.current; if (!el) return
    if (!m) { el.hidden = true; return }
    el.hidden = false
    el.textContent = `${m.cm} ס״מ`
    el.style.opacity = m.visible ? '1' : '0'
    el.style.transform = `translate(${m.screen.x}px, ${m.screen.y}px) translate(-50%, -140%)`
  }), [viewer])
  return <div ref={ref} className="panel mlabel" hidden />
}
