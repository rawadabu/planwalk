/**
 * PDF plan → walkable house.
 *   readLayers   every drawn path with its CAD layer
 *   allLabels    written things as stroke groups (names, notes, dimensions)
 *   readLabels   pictures of labels → text (Claude API)
 *   understand   layers + readings → plan@1 (storeys, walls, openings, named rooms, calibrated scale)
 *   toHouse      plan@1 → house@1 for the viewer
 * DWG plan → the same plan@1, without reading anything by eye:
 *   readDwg      every line, arc and text of the drawing in real units, with its layer
 *   understandCad  walls, windows, doors and named rooms from them
 */
export { readLayers, type PdfLayers, type Path } from './pdf'
export { allLabels, layerRoles, renderLabel, type Label } from './labels'
export { readLabels, asCm, type Read } from './read'
export { understand, PX_PER_M, type Plan, type PlanStorey, type PlanRoom, type PlanOpening } from './sheet'
export { toHouse } from './tohouse'
export { roomViews, toWorld, type RoomView } from './views'
export { readDwg, flatten, hebrew, type Cad, type CadLine, type CadText } from './dwg'
export { understandCad, cadRoles, type CadRole, type CadOptions } from './cadplan'
