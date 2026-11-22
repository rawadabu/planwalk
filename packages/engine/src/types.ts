import type { House, RoomTuple, StoreyId } from '@planwalk/house'

export type Quality = 'high' | 'medium' | 'low'
export type TimeOfDay = 'morning' | 'noon' | 'golden' | 'evening' | 'custom'
export type Mode = 'walk' | 'top' | 'outside' | 'story' | 'trans'

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
/** A point in the house: storey, plan pixels (x, y) and height above that storey's floor in metres */
export interface PlanPoint { floor: StoreyId; x: number; y: number; h: number }
/** Where the sun is for a real place and moment. north = plan angle of true north, degrees clockwise from the top of the sheet */
export interface SunAt { date: Date; lat: number; lng: number; north?: number }
/** How a surface is drawn (matches @planwalk/design's Look). */
export interface Look { color: string; texture?: 'oak' | 'walnut' | 'tile' | 'quartz' | 'plaster'; roughness: number; metalness?: number }
export type DesignPart = 'floor' | 'walls' | 'ceiling' | 'joinery' | 'worktop' | 'frames'
/** Per part, per storey (0, 1, 2): the look to draw, or null for the base model's own material. */
export type DesignLooks = Partial<Record<DesignPart, [Look | null, Look | null, Look | null]>>
/** A room's own finish (floor, walls or ceiling), drawn over the storey's. */
export interface RoomLook { part: 'floor' | 'walls' | 'ceiling'; floor: StoreyId; room: number; look: Look }
/** What is under the pointer in design mode. room = index into house.floors[floor].rooms (indoor rooms only). */
export interface SurfaceHit { part: DesignPart; floor: StoreyId; room: number | null; roomName: string | null; x: number; y: number }
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
  /** Every frame, after the camera moved and before drawing (for DOM overlays that follow 3D points) */
  frame: (dt: number) => void
  /** A click/tap on the canvas that wasn't a drag */
  tap: (p: { clientX: number; clientY: number }) => void
  /** Sun moved (custom time): azimuth from true north and elevation, degrees */
  sun: (s: { az: number; el: number }) => void
}

export interface Viewer {
  on<K extends keyof ViewerEvents>(event: K, handler: ViewerEvents[K]): () => void
  readonly state: { mode: Mode; floor: StoreyId; quality: Quality; time: TimeOfDay; lights: boolean; headBob: boolean }
  setFloor(floor: StoreyId): void
  setMode(mode: 'walk' | 'top' | 'outside'): void
  setTime(t: Exclude<TimeOfDay, 'custom'>): void
  /** Real sun for a place, date and hour (switches time to 'custom') */
  setSunAt(s: SunAt): { az: number; el: number }
  /** Scroll story: t ∈ [0, 1] builds the house stage by stage, then goes inside. null leaves the story. */
  setStory(t: number | null): void
  /** Live finishes: cabinets 'walnut' | 'oak' | 'navy' | 'sage' | 'white'; floor 'tile' | 'oak' | 'concrete' */
  setFinish(slot: 'cabinets' | 'floor', option: string): void
  /** Draw a design over the base model; {} returns to the architect's base. */
  applyDesign(looks: DesignLooks, rooms?: RoomLook[]): void
  /** Which design surface is under a screen point (floor, walls, ceiling, joinery, worktop, window frames), or null */
  pickSurface(clientX: number, clientY: number): SurfaceHit | null
  /** Highlight a room surface while it is being edited; null clears */
  highlight(sel: { part: DesignPart; floor: StoreyId; room: number | null } | null): void
  /** The surface point under a screen position, or null */
  pick(clientX: number, clientY: number): PlanPoint | null
  /** Screen position (CSS px, relative to the canvas) of a house point; visible = in front of the camera */
  toScreen(p: PlanPoint): { x: number; y: number; visible: boolean }
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
