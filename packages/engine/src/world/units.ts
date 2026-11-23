// Plan px → metres, and storey levels. 437 px = 440 cm (kitchen width on the plan).
export const K = 4.40 / 437
export const X = px => px * K
export const Z = py => py * K
// Heights are the house's own (house.storey); these are the values until a house is loaded, and for plans that do not state them.
export let H = 2.80                   // clear ceiling height
export let SLAB = 0.25
export let STOREY = H + SLAB          // floor-to-floor
export const LEVEL = { 0: -STOREY, 1: 0, 2: STOREY }
export let F2 = STOREY, H2 = STOREY + H
/** Take the storey heights of the house about to be built (ceiling and slab, metres). */
export function setStorey(height, slab) {
  H = height > 2 && height < 5 ? height : 2.80
  SLAB = slab > .05 && slab < 1 ? slab : 0.25
  STOREY = H + SLAB; F2 = STOREY; H2 = STOREY + H
  LEVEL[0] = -STOREY; LEVEL[1] = 0; LEVEL[2] = STOREY
}
export const EYE = 1.6
