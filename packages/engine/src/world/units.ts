// Plan px → metres, and storey levels. 437 px = 440 cm (kitchen width on the plan).
export const K = 4.40 / 437
export const X = px => px * K
export const Z = py => py * K
export const H = 2.80                 // clear ceiling height (assumed – not on the plan)
export const SLAB = 0.25
export const STOREY = H + SLAB        // 3.05 m floor-to-floor
export const LEVEL = { 0: -STOREY, 1: 0, 2: STOREY }
export const F2 = STOREY, H2 = STOREY + H
export const EYE = 1.6
