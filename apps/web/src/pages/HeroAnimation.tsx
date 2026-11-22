/**
 * Homepage hero: the product in one 12-second loop, drawn in SVG (no 3D runtime, no real house).
 *   plan lines draw → walls rise → floors get a finish and a price → finishes change, price follows → carpenter PDF slides in
 * Pure CSS keyframes; with reduced motion it rests on the finished frame.
 */
const ISO = (x: number, y: number, z = 0): [number, number] => [(x - y) * 26 + 300, (x + y) * 15 - z * 30 + 120]
const pts = (p: Array<[number, number, number?]>) => p.map(([x, y, z]) => ISO(x, y, z ?? 0).map(n => n.toFixed(1)).join(',')).join(' ')

// a small apartment, metres: outer walls and two partitions, with a window gap on the south wall
const WALLS: Array<[number, number, number, number]> = [
  [0, 0, 9, 0], [9, 0, 9, 6.5], [0, 0, 0, 6.5], [0, 6.5, 3.2, 6.5], [5.2, 6.5, 9, 6.5],
  [4.2, 0, 4.2, 3.6], [4.2, 3.6, 9, 3.6],
]
const ROOMS: Array<{ r: [number, number, number, number]; cls: string }> = [
  { r: [0, 0, 4.2, 6.5], cls: 'f1' }, { r: [4.2, 0, 9, 3.6], cls: 'f2' }, { r: [4.2, 3.6, 9, 6.5], cls: 'f3' },
]
const H = 2.7

export function HeroAnimation() {
  // far walls first so nearer ones paint over them
  const walls = [...WALLS].sort((a, b) => (a[0] + a[1] + a[2] + a[3]) - (b[0] + b[1] + b[2] + b[3]))
  return (
    <div className="heroanim" role="img" aria-label="Animation: a floor plan is drawn, its walls rise into a 3D home, the floor finish changes and the price updates, then a cut-list PDF for the carpenter appears">
      <svg viewBox="0 0 600 420" aria-hidden>
        <defs>
          <pattern id="ha-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" className="ha-gridline" /></pattern>
        </defs>
        <rect width="600" height="420" fill="url(#ha-grid)" className="ha-bg" />
        <g className="ha-scene">
          {/* floors (finish changes over time) */}
          {ROOMS.map(({ r: [x1, y1, x2, y2], cls }) => <polygon key={cls} className={'ha-floor ' + cls} points={pts([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])} />)}
          {/* the plan, drawn line by line */}
          {WALLS.map(([x1, y1, x2, y2], i) => { const [a, b] = ISO(x1, y1), [c, d] = ISO(x2, y2); return <line key={'p' + i} className="ha-plan" x1={a} y1={b} x2={c} y2={d} style={{ animationDelay: `${i * .22}s` }} /> })}
          {/* dimension along the south wall */}
          <g className="ha-dim"><line x1={ISO(0, 7.3)[0]} y1={ISO(0, 7.3)[1]} x2={ISO(9, 7.3)[0]} y2={ISO(9, 7.3)[1]} /><text x={ISO(4.5, 7.3)[0] - 8} y={ISO(4.5, 7.3)[1] + 18}>900</text></g>
          {/* walls rising */}
          {walls.map(([x1, y1, x2, y2], i) => (
            <g key={'w' + i} className="ha-wall" style={{ animationDelay: `${i * .08}s` }}>
              <polygon className={x1 === x2 ? 'side' : 'front'} points={pts([[x1, y1, 0], [x2, y2, 0], [x2, y2, H], [x1, y1, H]])} />
              <line className="cap" x1={ISO(x1, y1, H)[0]} y1={ISO(x1, y1, H)[1]} x2={ISO(x2, y2, H)[0]} y2={ISO(x2, y2, H)[1]} />
            </g>
          ))}
        </g>
        {/* price card, three states */}
        <g className="ha-price" transform="translate(410 40)">
          <rect width="170" height="76" rx="12" />
          <text x="16" y="26" className="lbl">Floors · live price</text>
          {[['Light porcelain', '₪148,200'], ['Natural oak', '₪171,900'], ['Polished concrete', '₪139,500']].map(([n, p], i) => (
            <g key={n} className={'ha-state s' + i}><text x="16" y="48" className="fin">{n}</text><text x="16" y="66" className="amt">{p}</text></g>
          ))}
        </g>
        {/* the carpenter's PDF */}
        <g className="ha-pdf" transform="translate(28 250)">
          <rect width="150" height="140" rx="8" />
          <text x="14" y="24" className="lbl">Cut list · PDF</text>
          {[0, 1, 2, 3, 4].map(i => <rect key={i} className="row" x="14" y={38 + i * 16} width={i % 2 ? 96 : 122} height="7" rx="3" />)}
          <rect className="sheet" x="96" y="98" width="42" height="30" rx="2" />
          <path className="sheet-l" d="M96 113h42M117 98v30" />
        </g>
      </svg>
    </div>
  )
}
