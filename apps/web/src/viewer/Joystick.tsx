import { useRef } from 'react'
import type { Viewer } from '@planwalk/engine'

// Touch joystick (shown on coarse pointers via CSS). Sends −1…1 per axis to the engine.
export function Joystick({ viewer }: { viewer: Viewer }) {
  const knob = useRef<HTMLElement>(null)
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), m = r.width * .38
    let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2
    const l = Math.hypot(dx, dy); if (l > m) { dx *= m / l; dy *= m / l }
    viewer.setJoystick(dx / m, dy / m)
    if (knob.current) knob.current.style.transform = `translate(${dx}px,${dy}px)`
  }
  const end = () => { viewer.setJoystick(0, 0); if (knob.current) knob.current.style.transform = '' }
  return (
    <div className="joy" aria-hidden onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); move(e) }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e) }} onPointerUp={end} onPointerCancel={end}>
      <i ref={knob} />
    </div>
  )
}
