import type { House, RoomTuple, StoreyId } from '@planwalk/house'

export type Quality = 'high' | 'medium' | 'low'
export type TimeOfDay = 'morning' | 'noon' | 'golden' | 'evening'
export type Mode = 'walk' | 'top' | 'trans'

export interface ViewerOptions {
  canvas: HTMLCanvasElement
  /** URL of the house.json (e.g. /api/houses/twin-a/house.json) */
  houseUrl: string
  /** Base URL of the shared asset library (textures, models, sky), ending with '/' */
  libraryUrl: string
  /** URL of the decode worker script (Vite: new URL('@planwalk/engine/decode.worker', import.meta.url)) */
  workerUrl?: string | URL
  quality?: Quality
  /** Render only when requested (automated screenshots) */
  manualRender?: boolean
}

export interface Pose { x: number; y: number; yaw: number; floor: StoreyId }
export interface MeasureReading { cm: number; screen: { x: number; y: number }; visible: boolean }

/** Events the viewer emits. The UI subscribes with viewer.on(name, handler). */
export interface ViewerEvents {
  progress: (loaded: number, total: number) => void
  ready: (house: House) => void
  error: (message: string) => void
  floor: (floor: StoreyId) => void
  mode: (mode: Mode) => void
  room: (room: RoomTuple | null) => void
  pose: (pose: Pose) => void
  nearStair: (near: boolean) => void
  measure: (reading: MeasureReading | null) => void
  quality: (q: Quality) => void
  time: (t: TimeOfDay) => void
  lights: (on: boolean) => void
}

export interface Viewer {
  on<K extends keyof ViewerEvents>(event: K, handler: ViewerEvents[K]): () => void
  readonly state: { mode: Mode; floor: StoreyId; quality: Quality; time: TimeOfDay; lights: boolean; headBob: boolean }
  setFloor(floor: StoreyId): void
  setMode(mode: 'walk' | 'top'): void
  setTime(t: TimeOfDay): void
  setQuality(q: Quality): void
  setLights(on: boolean): void
  setHeadBob(on: boolean): void
  climb(dir: 1 | -1): void
  teleport(x: number, y: number): void
  /** Touch joystick input, each axis −1…1 */
  setJoystick(x: number, y: number): void
  setMeasuring(on: boolean): void
  resetView(): void
  /** Draw calls, triangles and programs of the last frame */
  stats(): { calls: number; triangles: number; programs: number }
  requestRender(): void
  destroy(): void
}
