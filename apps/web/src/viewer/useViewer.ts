import { useEffect, useRef, useState } from 'react'
import { createViewer, type Viewer, type Mode, type Quality, type TimeOfDay, type MeasureReading } from '@planwalk/engine'
import type { House, RoomTuple, StoreyId } from '@planwalk/house'
import { api } from '../api'

export interface ViewerUiState {
  progress: number
  house: House | null
  error: string | null
  floor: StoreyId
  mode: Mode
  room: RoomTuple | null
  nearStair: boolean
  quality: Quality
  time: TimeOfDay
  lights: boolean
  headBob: boolean
}

/**
 * Mounts the engine on a canvas and mirrors its low-frequency state into React.
 * High-frequency data (pose every frame, measure label position) is NOT put in React state:
 * consumers subscribe with viewer.on('pose' | 'measure') and write to DOM refs, so React re-renders only on real changes.
 */
export function useViewer(houseId: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [ui, setUi] = useState<ViewerUiState>({ progress: 0, house: null, error: null, floor: 1, mode: 'walk', room: null, nearStair: false, quality: 'medium', time: 'golden', lights: false, headBob: true })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let v: Viewer
    try {
      v = createViewer({ canvas, houseUrl: api.houseUrl(houseId), libraryUrl: api.libraryUrl, manualRender: new URLSearchParams(location.search).has('test') })
    } catch (e) {
      setUi(s => ({ ...s, error: 'WebGL is not available in this browser.' })); return
    }
    const patch = (p: Partial<ViewerUiState>) => setUi(s => ({ ...s, ...p }))
    patch({ quality: v.state.quality })
    v.on('progress', (a, b) => patch({ progress: a / b }))
    v.on('ready', house => patch({ house, floor: v.state.floor }))
    v.on('error', error => patch({ error }))
    v.on('floor', floor => patch({ floor }))
    v.on('mode', mode => patch({ mode }))
    v.on('room', room => patch({ room }))
    v.on('nearStair', nearStair => patch({ nearStair }))
    v.on('quality', quality => patch({ quality }))
    v.on('time', time => patch({ time }))
    v.on('lights', lights => patch({ lights }))
    setViewer(v)
    ;(window as unknown as { __viewer?: Viewer }).__viewer = v      // for debugging and automated checks
    return () => { v.destroy(); setViewer(null) }
  }, [houseId])

  return { canvasRef, viewer, ui, setUi }
}
export type { MeasureReading }
