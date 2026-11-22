import { useEffect, useRef } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { House, RoomTuple, StoreyId } from '@planwalk/house'
import { api } from '../api'

// The architect's plan for the current storey, rooms highlighted, live position + view cone. Click to move there.
export function MiniMap({ viewer, house, houseId, floor, room }: { viewer: Viewer; house: House; houseId: string; floor: StoreyId; room: RoomTuple | null }) {
  const svgRef = useRef<SVGSVGElement>(null), meRef = useRef<SVGGElement>(null), coneRef = useRef<SVGGElement>(null)
  const fl = house.floors[floor]
  useEffect(() => {
    let yaw = 0
    return viewer.on('pose', p => {        // every frame → write straight to the DOM, no React render
      yaw += (p.yaw - yaw) * .25
      meRef.current?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`)
      coneRef.current?.setAttribute('transform', `rotate(${(-yaw * 180 / Math.PI).toFixed(1)})`)
    })
  }, [viewer])
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current; if (!svg) return
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse()); viewer.teleport(p.x, p.y)
  }
  return (
    <div className="panel mapbox">
      <div className="cap"><span>התוכנית המקורית</span><span>לחיצה על המפה מעבירה לשם</span></div>
      <div className="map">
        <img src={api.houseFile(houseId, fl.map)} alt={`תוכנית ${fl.name}`} />
        <svg ref={svgRef} viewBox="90 80 1070 1400" preserveAspectRatio="none" onClick={onClick} aria-label="מפה. לחיצה מעבירה אותך למקום">
          {fl.rooms.slice(0, fl.indoor).map(r => {
            const x1 = Math.max(r[2], 105), y1 = Math.max(r[3], 105), x2 = Math.min(r[4], 1040), y2 = Math.min(r[5], 1460)
            return (
              <g key={r[0] + r[2] + r[3]} className={room === r ? 'on' : ''}>
                <rect className="rm" x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={6} />
                {r[1] && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2}>{r[0]}</text>}
              </g>
            )
          })}
          <g ref={meRef}>
            <g ref={coneRef}><path d="M0 0 L-58 -100 A116 116 0 0 1 58 -100 Z" fill="rgba(229,72,59,.28)" /></g>
            <circle r={13} fill="#e5483b" stroke="#fff" strokeWidth={5} />
          </g>
        </svg>
      </div>
    </div>
  )
}
