import type { House, StoreyId } from '@planwalk/house'

const K2 = (4.40 / 437) ** 2              // plan px² → m²
const clip = (r: [number, number, number, number]) => {
  const x1 = Math.max(r[0], 105), y1 = Math.max(r[1], 105), x2 = Math.min(r[2], 1040), y2 = Math.min(r[3], 1460)
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1) * K2
}
const fmt = (m2: number) => m2.toLocaleString('he-IL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** Room areas per storey, computed from the room rectangles taken off the architect's plan. */
export function areaTable(house: House) {
  return ([2, 1, 0] as StoreyId[]).map(f => {
    const fl = house.floors[f]
    // the architect's written dimensions ("370 × 360" cm) win; rooms without them fall back to the drawn outline
    const rooms = fl.rooms.slice(0, fl.indoor).map(r => {
      const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/.exec(r[1])
      return { name: r[0], dims: r[1], m2: m ? (+m[1] * +m[2]) / 10000 : clip([r[2], r[3], r[4], r[5]]), fromPlan: !!m }
    })
    // balconies / decks drawn on this storey
    const decks = house.items.filter(i => i.k === 'box' && i.f === f && i.m === 'deck' && 'r' in i)
      .map(i => { const r = (i as { r: [number, number, number, number] }).r; return (r[2] - r[0]) * (r[3] - r[1]) * K2 })
    return { floor: f, name: fl.name, rooms, indoor: rooms.reduce((a, r) => a + r.m2, 0), outdoor: decks.reduce((a, b) => a + b, 0) }
  })
}

export function AreasPanel({ house, floor, onClose }: { house: House; floor: StoreyId; onClose: () => void }) {
  const t = areaTable(house)
  const total = t.reduce((a, f) => a + f.indoor, 0), out = t.reduce((a, f) => a + f.outdoor, 0)
  return (
    <section className="panel drawer" aria-label="טבלת שטחים">
      <header><h2>שטחים</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <div className="sum"><div><b>{fmt(total)}</b><span>מ״ר חדרים</span></div><div><b>{fmt(out)}</b><span>מ״ר מרפסות</span></div></div>
      {t.map(f => (
        <table key={f.floor} className={f.floor === floor ? 'cur' : ''}>
          <caption>{f.name}<span>{fmt(f.indoor)} מ״ר</span></caption>
          <tbody>
            {f.rooms.map((r, i) => <tr key={i}><td>{r.name}</td><td className="dim">{r.dims}</td><td className={'num' + (r.fromPlan ? '' : ' est')} title={r.fromPlan ? 'לפי המידות בתוכנית' : 'לפי השרטוט (אין מידות כתובות)'}>{fmt(r.m2)}{r.fromPlan ? '' : '*'}</td></tr>)}
            {f.outdoor > 0 && <tr className="out"><td>מרפסת</td><td /><td className="num">{fmt(f.outdoor)}</td></tr>}
          </tbody>
        </table>
      ))}
      <p className="fine">לפי המידות שכתובות בתוכנית (קנ״מ {house.source.scale}). * = אין מידות כתובות, נמדד מהשרטוט. שטח נטו של החדרים, לא שטח רישום.</p>
    </section>
  )
}
