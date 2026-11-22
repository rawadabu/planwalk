import { z } from 'zod'

/**
 * house@1 — the contract between the processing pipeline, the API, the web app and the 3D engine.
 * Plan units are px of a 216 dpi render of the architect's PDF (pxPerMetre ≈ 99.3 at 1:100).
 * Heights are metres above the storey floor. Storeys: 0 ground, 1 first, 2 second.
 */
const Pt = z.tuple([z.number(), z.number()])
const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()])
export const Polygon = z.array(Pt).min(3)
export const Glass = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])   // x1,y1,x2,y2,sill,head
export const Room = z.tuple([z.string(), z.string(), z.number(), z.number(), z.number(), z.number()])     // name, dims, rect
export const StoreyId = z.union([z.literal(0), z.literal(1), z.literal(2)])

export const Floor = z.object({
  name: z.string(),
  bounds: Rect,
  map: z.string(),                                  // plan image, relative to the house folder
  start: z.object({ x: z.number(), y: z.number(), yaw: z.number() }),
  walls: z.array(Polygon),
  glass: z.array(Glass),
  rooms: z.array(Room),
  indoor: z.number().int().nonnegative(),           // the first `indoor` rooms are indoors
  rects: z.array(Rect),                             // collision footprints
})

const base = { f: StoreyId, layer: z.enum(['arch', 'int', 'outdoor', 'roof']).optional() }
export const Item = z.discriminatedUnion('k', [
  z.object({ k: z.literal('box'), ...base, r: Rect, y: z.tuple([z.number(), z.number()]), m: z.string(), rad: z.number().optional(), rot: z.boolean().optional() }),
  z.object({ k: z.literal('base'), ...base, r: Rect, h: z.number().optional() }),
  z.object({ k: z.literal('tall'), ...base, r: Rect, h: z.number().optional() }),
  z.object({ k: z.literal('bed'), ...base, r: Rect, head: z.enum(['x1', 'x2', 'y1', 'y2']) }),
  z.object({ k: z.literal('rug'), ...base, r: Rect }),
  // kitchen designer output (one module of a run); fronts face `dir`
  z.object({ k: z.literal('cabinet'), ...base, r: Rect, kind: z.enum(['drawers', 'doors', 'sink', 'hob', 'dishwasher', 'corner', 'fridge', 'oven', 'pantry', 'filler', 'upper', 'hood']), dir: z.enum(['x+', 'x-', 'y+', 'y-']), n: z.number().int().optional() }),
  z.object({ k: z.literal('slot'), ...base, r: Rect }),
  z.object({ k: z.literal('slats'), ...base, r: Rect, h: z.number() }),
  z.object({ k: z.literal('shelving'), ...base, r: Rect }),
  z.object({ k: z.literal('planter'), ...base, r: Rect, h: z.number() }),
  z.object({ k: z.literal('opening'), ...base, r: Rect, head: z.number() }),
  z.object({ k: z.literal('clerestory'), ...base, r: Rect, sill: z.number(), headFromCeiling: z.number() }),
  z.object({ k: z.literal('lights'), ...base, p: z.array(Pt) }),
  z.object({ k: z.literal('pendantBar'), ...base, r: Rect }),
  z.object({ k: z.literal('rings'), ...base, c: Pt }),
  z.object({ k: z.literal('fireplace'), ...base, r: Rect }),
  z.object({ k: z.literal('stairU'), ...base }),
  z.object({ k: z.literal('model'), ...base, name: z.string(), r: Rect, h: z.number(), rot: z.number(), uniform: z.boolean().optional(), y: z.number().optional() }),
])

export const House = z.object({
  format: z.literal('house@1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  source: z.object({ file: z.string(), scale: z.string(), pxPerMetre: z.number(), note: z.string().optional() }),
  storey: z.object({ height: z.number(), slab: z.number(), assumed: z.boolean() }),
  floors: z.object({ 0: Floor, 1: Floor, 2: Floor }),
  void: z.array(Pt),
  stairs: z.object({
    step: z.number(),
    path: z.record(z.string(), z.array(z.tuple([z.number(), z.number(), z.number()]))),
    exit: z.record(z.string(), Pt),
    trigger: z.record(z.string(), z.tuple([z.number(), z.number(), z.number(), Pt.nullable()])),
    zone: z.record(z.string(), Rect),
    arrive: z.record(z.string(), z.object({ x: z.number(), y: z.number(), yaw: z.number() })),
  }),
  canopies: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
  items: z.array(Item),
})

export type Pt = z.infer<typeof Pt>
export type Rect = z.infer<typeof Rect>
export type Floor = z.infer<typeof Floor>
export type Item = z.infer<typeof Item>
export type House = z.infer<typeof House>
export type StoreyId = z.infer<typeof StoreyId>
export type RoomTuple = z.infer<typeof Room>

/** Validate untrusted JSON (uploads, pipeline output). Throws with a readable path on failure. */
export function parseHouse(json: unknown): House {
  return House.parse(json)
}

/** Shared library of 3D models every house can reference by name (generated once, reused). */
export const LIBRARY_MODELS = ['sofa', 'armchair', 'coffeeTable', 'nestingTable', 'roundTable', 'island', 'diningChair', 'oliveTree', 'succulent', 'vase',
  'bedDouble', 'bedSingle', 'nightstand', 'toilet', 'bathtub', 'vanity', 'desk', 'deskChair'] as const
export type LibraryModel = (typeof LIBRARY_MODELS)[number]
