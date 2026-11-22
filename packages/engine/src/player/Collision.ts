// 2D capsule collision in plan px against the wall polygons and furniture rectangles of one storey.
const RAD = 28   // ≈ 28 cm

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t))
  const qx = ax + t * dx - px, qy = ay + t * dy - py; return qx * qx + qy * qy
}
function inPoly(x, y, p) {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c }
  return c
}
export default class Collision {
  [key: string]: any
  constructor(house) {
    // precompute polygon bounding boxes so most walls are rejected with 4 comparisons
    this.floors = {}
    for (const f of [0, 1, 2]) {
      const fl = house.floors[f]
      this.floors[f] = {
        bounds: fl.bounds,
        polys: fl.walls.map(p => ({ p, x1: Math.min(...p.map(q => q[0])) - RAD, x2: Math.max(...p.map(q => q[0])) + RAD, y1: Math.min(...p.map(q => q[1])) - RAD, y2: Math.max(...p.map(q => q[1])) + RAD })),
        rects: fl.rects,
      }
    }
  }
  blocked(f, px, py) {
    const F = this.floors[f], [bx1, by1, bx2, by2] = F.bounds
    if (px < bx1 || px > bx2 || py < by1 || py > by2) return true
    for (const { p, x1, x2, y1, y2 } of F.polys) {
      if (px < x1 || px > x2 || py < y1 || py > y2) continue
      if (inPoly(px, py, p)) return true
      for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (segDist2(px, py, a[0], a[1], b[0], b[1]) < RAD * RAD) return true }
    }
    for (const [x1, y1, x2, y2] of F.rects) { const cx = Math.max(x1, Math.min(px, x2)), cy = Math.max(y1, Math.min(py, y2)); if ((px - cx) ** 2 + (py - cy) ** 2 < RAD * RAD) return true }
    return false
  }
  // nearest free spot by spiral search (for teleports and arrivals)
  free(f, x, y, max = 200) {
    if (!this.blocked(f, x, y)) return { x, y }
    for (let r = 8; r < max; r += 8) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r; if (!this.blocked(f, nx, ny)) return { x: nx, y: ny } }
    return null
  }
}
