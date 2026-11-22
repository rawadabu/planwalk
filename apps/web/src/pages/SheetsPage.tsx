import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { parseHouse, type House } from '@planwalk/house'
import {
  PX_PER_CM, SHEET, applyEdits, cabinets, finish, hardware, isTall, kitchenRuns, nest, panels, parseDesign, resolveFinish, runFootprint, windowsBehind, worktop,
  type Cabinet, type Design, type Panel, type Run, type SheetLayout, type WorktopPiece,
} from '@planwalk/design'
import { api } from '../api'
import '../styles/sheets.css'

/**
 * Carpenter drawing set (sheet A-07): A3 sheets generated from a design. "Download PDF" uses the browser's own
 * PDF printer, so drawings stay vector and Hebrew stays right. The design comes from the viewer (local hand-off)
 * or, in the full app, from a saved design (?design=<id>).
 */
export const sheetKey = (houseId: string) => `planwalk.sheet.${houseId}`
export interface SheetHandoff { design: Design; name: string; version: number | null; at: string }

const MATERIAL_HE = { carcass: 'גוף · מלמין לבן 18 מ״מ', front: 'חזיתות 18 מ״מ', back: 'גב · HDF 3 מ״מ' }
const mm = (n: number) => Math.round(n).toLocaleString('en-US')

export default function SheetsPage() {
  const { houseId = 'twin-a' } = useParams()
  const [qs] = useSearchParams()
  const [house, setHouse] = useState<House | null>(null)
  const [src, setSrc] = useState<SheetHandoff | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const h = parseHouse(await (await fetch(api.houseUrl(houseId), { credentials: 'include' })).json())
        let s: SheetHandoff | null = null
        const id = qs.get('design')
        if (id) { const d = await api.design(id); s = { design: parseDesign(d.data), name: d.name, version: d.version, at: d.updatedAt } }
        else { try { const raw = localStorage.getItem(sheetKey(houseId)); if (raw) { const v = JSON.parse(raw); s = { ...v, design: parseDesign(v.design) } } } catch { /* no hand-off */ } }
        if (alive) { setHouse(h); setSrc(s ?? { design: parseDesign({ format: 'design@1' }), name: 'המטבח שבתוכנית', version: null, at: new Date().toISOString() }) }
      } catch (e) { if (alive) setError((e as Error).message) }
    })()
    return () => { alive = false }
  }, [houseId, qs])

  const data = useMemo(() => {
    if (!house || !src) return null
    const eff = applyEdits(house, src.design.edits).house
    const runs = kitchenRuns(eff, src.design)
    return runs.map(run => {
      const win = windowsBehind(eff, run)
      const cabs = cabinets(run, (a, b) => !win.some(([x, y]) => x * 10 < b && y * 10 > a))
      const ps = panels(cabs)
      return { run, cabs, ps, layouts: (['carcass', 'front', 'back'] as const).map(m => nest(ps, m)), tops: worktop(run), hw: hardware(cabs, ps), win }
    })
  }, [house, src])
  useEffect(() => { document.title = house ? `מטבח · ${house.title} · שרטוטים לנגר` : 'שרטוטים לנגר' }, [house])

  if (error) return <div className="sheets-msg">לא הצלחנו לטעון את הבית: {error}</div>
  if (!house || !src || !data) return <div className="sheets-msg">מכינים את השרטוטים…</div>
  if (!data.length) return <div className="sheets-msg">אין מטבח בעיצוב הזה. פתחו "מטבח" בבית והתחילו מהתוכנית.</div>

  const d = src.design, floor = data[0].run.floor
  const front = finish(resolveFinish(d, 'joinery', { floor }).id), top = finish(resolveFinish(d, 'worktop', { floor }).id)
  const rev = src.version ? `גרסה ${src.version}` : 'טיוטה'
  const date = new Date(src.at).toLocaleDateString('he-IL')
  const total = 4 + data.length + 1
  const tb = (no: number, title: string, scale?: string) => <TitleBlock house={house} design={src.name} rev={rev} date={date} no={no} of={total} title={title} scale={scale} />

  return (
    <div className="sheets" dir="rtl">
      <div className="toolbar noprint">
        <Link to={`/h/${houseId}`}>← חזרה לבית</Link>
        <span>{src.name} · {rev}</span>
        <button className="btn primary" onClick={() => window.print()}>הורדת PDF</button>
        <span className="hint">בחלון ההדפסה: יעד "שמירה כ-PDF", גודל A3, לרוחב</span>
      </div>

      {/* K-01 general */}
      <section className="sheet">
        <div className="body cover">
          <div>
            <div className="eyebrow">שרטוטי ייצור · מטבח</div>
            <h1>{house.title}</h1>
            <p className="sub">{src.name} · {rev} · {date}</p>
            <table className="spec"><tbody>
              <tr><th>חזיתות</th><td>{front?.he} ({front?.en}), 18 מ״מ, קנט ABS 1 מ״מ בגוון</td></tr>
              <tr><th>גוף</th><td>מלמין לבן 18 מ״מ, קנט 1 מ״מ בחזית</td></tr>
              <tr><th>גב</th><td>HDF לבן 3 מ״מ, בחריץ</td></tr>
              <tr><th>משטח</th><td>{top?.he} ({top?.en}), 30 מ״מ, בליטה 20 מ״מ</td></tr>
              <tr><th>סוקל</th><td>100 מ״מ, נסוג 60 מ״מ, בגוון החזית</td></tr>
              <tr><th>ידיות</th><td>ידית מתכת שחורה, אורך 1/3 מרוחב החזית</td></tr>
              <tr><th>גבהים</th><td>ארון תחתון 870 + משטח 30 = 900 · ארון גבוה 2200 · ארון עליון 700, תחתית ב-1450</td></tr>
            </tbody></table>
          </div>
          <div>
            <h2>כמויות</h2>
            {data.map(({ run, cabs, layouts, hw, tops }, i) => (
              <table key={i} className="spec"><tbody>
                <tr><th>קיר {i + 1}</th><td>{mm(run.length * 10)} מ״מ · {cabs.length} ארונות</td></tr>
                {layouts.map(l => <tr key={l.material}><th>{MATERIAL_HE[l.material]}</th><td>{l.sheets.length} לוחות {SHEET.w}×{SHEET.h} · ניצול {Math.round(l.used * 100)}%</td></tr>)}
                <tr><th>משטח</th><td>{tops.map(t => `${mm(t.length)}×${t.depth}`).join(' + ')} מ״מ</td></tr>
                <tr><th>פרזול</th><td>{hw.hinges} צירים · {hw.runners} מסילות מגירה · {hw.handles} ידיות · {hw.legs} רגליות</td></tr>
                <tr><th>קנטים</th><td>{hw.edgeBandM} מ׳ · סוקל {hw.plinthM} מ׳</td></tr>
              </tbody></table>
            ))}
            <p className="note">כל המידות במילימטרים. המידות נלקחו מתוכנית האדריכל; <b>יש למדוד באתר לפני ייצור</b>. רוחב ארון = רוחב גוף; חזיתות קטנות ב-3 מ״מ למרווח.</p>
            <div className="sign"><div>אישור לקוח</div><div>אישור נגר</div></div>
          </div>
        </div>
        {tb(1, 'כללי וכמויות')}
      </section>

      {/* K-02 plan + elevation */}
      {data.map(({ run, cabs, win }, i) => (
        <section className="sheet" key={'e' + i}>
          <div className="body two">
            <figure><figcaption>תוכנית · קיר {i + 1}</figcaption><PlanView house={applyEdits(house, d.edits).house} run={run} cabs={cabs} /></figure>
            <figure><figcaption>חזית · קיר {i + 1} (כפי שרואים מולו)</figcaption><Elevation run={run} cabs={cabs} win={win} /></figure>
          </div>
          {tb(2 + i, `תוכנית וחזית · קיר ${i + 1}`, '1:25')}
        </section>
      ))}

      {/* K-03 cabinet schedule */}
      <section className="sheet">
        <div className="body">
          {data.map(({ cabs }, i) => (
            <table key={i} className="grid">
              <thead><tr><th>#</th><th>ארון</th><th>רוחב</th><th>גובה</th><th>עומק</th><th>חזיתות</th><th>צירים</th><th>מסילות</th><th>ידיות</th><th>רגליות</th><th>מדפים</th><th>הערות</th></tr></thead>
              <tbody>{cabs.map(c => (
                <tr key={c.no}><td>{c.no}</td><td>{c.he}</td><td className="n">{mm(c.w)}</td><td className="n">{mm(c.h)}</td><td className="n">{mm(c.d)}</td>
                  <td className="n">{c.fronts.map(f => `${f.kind === 'door' ? 'ד' : f.kind === 'drawer' ? 'מ' : 'פ'} ${mm(f.w)}×${mm(f.h)}`).join(' · ')}</td>
                  <td className="n">{c.hinges || ''}</td><td className="n">{c.runners || ''}</td><td className="n">{c.handles || ''}</td><td className="n">{c.legs || ''}</td><td className="n">{c.shelves || ''}</td><td>{c.note}</td></tr>
              ))}</tbody>
            </table>
          ))}
          <p className="note">ד = דלת · מ = חזית מגירה · פ = חזית קבועה. רוחב × גובה במ״מ.</p>
        </div>
        {tb(2 + data.length, 'טבלת ארונות')}
      </section>

      {/* K-04 cut list */}
      <section className="sheet">
        <div className="body cut">
          {data.map(({ ps, layouts }, i) => (['carcass', 'front', 'back'] as const).map(mat => (
            <div key={i + mat} className="cutblock">
              <h3>{MATERIAL_HE[mat]}{mat === 'front' && front ? ` · ${front.he}` : ''}</h3>
              <CutTable list={ps.filter(p => p.material === mat)} />
            </div>
          )))}
        </div>
        {tb(3 + data.length, 'רשימת חיתוך')}
      </section>

      {/* K-05 boards */}
      <section className="sheet">
        <div className="body boardsheet">
          {data.map(({ layouts }, i) => layouts.map(l => (
            <div key={i + l.material} className="cutblock">
              <h3>{MATERIAL_HE[l.material]}{l.material === 'front' && front ? ` · ${front.he}` : ''} · {l.sheets.length} לוחות · ניצול {Math.round(l.used * 100)}%</h3>
              <Sheets layout={l} />
            </div>
          )))}
          <p className="note">לוח {SHEET.w}×{SHEET.h} מ״מ, יישור {SHEET.trim} מ״מ בכל צד, מסור {SHEET.kerf} מ״מ. חזיתות שומרות על כיוון הסיבים; לוחות גוף מסתובבים לפי הצורך.</p>
        </div>
        {tb(4 + data.length, 'סידור על לוחות')}
      </section>

      {/* K-05 worktop */}
      <section className="sheet">
        <div className="body">
          {data.map(({ tops }, i) => tops.map((t, k) => <figure key={i + '-' + k}><figcaption>משטח {k + 1}{t.joint ? ' (חיבור במפגש ארונות)' : ''} · {top?.he}</figcaption><TopView p={t} /></figure>))}
          <p className="note">מידות החיתוכים למרכז הפתח. יש לאשר מול דגם הכיור והכיריים שנבחרו לפני חיתוך.</p>
        </div>
        {tb(5 + data.length, 'משטח וחיתוכים', '1:20')}
      </section>
    </div>
  )
}

function TitleBlock({ house, design, rev, date, no, of, title, scale }: { house: House; design: string; rev: string; date: string; no: number; of: number; title: string; scale?: string }) {
  return (
    <div className="titleblock">
      <div className="tb-brand">Planwalk</div>
      <div><span>פרויקט</span><b>{house.title}</b></div>
      <div><span>עיצוב</span><b>{design}</b></div>
      <div className="wide"><span>גיליון</span><b>{title}</b></div>
      <div><span>קנה מידה</span><b>{scale ?? '—'}</b></div>
      <div><span>גרסה</span><b>{rev}</b></div>
      <div><span>תאריך</span><b>{date}</b></div>
      <div className="no"><span>מס׳</span><b>K-0{no} / {of}</b></div>
    </div>
  )
}

// ── drawings (SVG in real millimetres; the sheet sets the paper size) ──
const DIM = 'dim'
function Dim({ x1, x2, y, label, s, vertical }: { x1: number; x2: number; y: number; label: string; s: number; vertical?: boolean }) {
  const t = 2.2 * s, k = 1.2 * s                                     // 2.2 mm text, 1.2 mm ticks on paper
  if (vertical) return (
    <g className={DIM}>
      <line x1={y} y1={x1} x2={y} y2={x2} /><line x1={y - k} y1={x1 + k} x2={y + k} y2={x1 - k} /><line x1={y - k} y1={x2 + k} x2={y + k} y2={x2 - k} />
      <text x={y - t * .6} y={(x1 + x2) / 2} fontSize={t} textAnchor="middle" transform={`rotate(-90 ${y - t * .6} ${(x1 + x2) / 2})`}>{label}</text>
    </g>
  )
  return (
    <g className={DIM}>
      <line x1={x1} y1={y} x2={x2} y2={y} /><line x1={x1 - k} y1={y + k} x2={x1 + k} y2={y - k} /><line x1={x2 - k} y1={y + k} x2={x2 + k} y2={y - k} />
      <text x={(x1 + x2) / 2} y={y - t * .5} fontSize={t} textAnchor="middle">{label}</text>
    </g>
  )
}

function Elevation({ run, cabs, win }: { run: Run; cabs: Cabinet[]; win: Array<[number, number, number, number]> }) {
  const S = 25, L = run.length * 10, Htot = 2600, padL = 700, padB = 900, padT = 250
  const mirror = run.axis === 'y' ? run.facing > 0 : run.facing < 0
  const X = (x: number) => (mirror ? L - x : x)
  const Y = (h: number) => Htot - h
  const lower = cabs.filter(c => c.type !== 'upper')
  let at = 0
  const placed = lower.map(c => { const r = { c, x: at }; at += c.w; return r })
  const uppers: Array<{ c: Cabinet; x: number }> = []
  { let a = 0; let li = 0; for (const c of cabs) { if (c.type === 'upper') uppers.push({ c, x: a - placed[li - 1].c.w }); else { a += c.w; li++ } } }
  const w = L + padL * 2, h = Htot + padB + padT
  const rect = (x: number, wd: number, h0: number, h1: number, cls: string, key: string) => <rect key={key} className={cls} x={Math.min(X(x), X(x + wd))} y={Y(h1)} width={wd} height={h1 - h0} />
  return (
    <svg viewBox={`${-padL} ${-padT} ${w} ${h}`} style={{ width: `${w / S}mm`, height: `${h / S}mm` }} className="drawing">
      {win.map(([a, b, sill, head], i) => rect(Math.max(0, a * 10), (Math.min(run.length, b) - Math.max(0, a)) * 10, sill * 1000, head * 1000, 'win', 'w' + i))}
      <line className="floorline" x1={-padL / 2} x2={L + padL / 2} y1={Y(0)} y2={Y(0)} />
      {placed.map(({ c, x }) => {
        const top = c.h, g: React.ReactElement[] = []
        g.push(rect(x, c.w, 0, 100, 'plinth', 'p'))
        g.push(rect(x, c.w, 100, top, 'cab', 'c'))
        // front splits as in the 3D model
        const splits = c.type === 'drawers' || c.type === 'hob' ? [320, 580] : c.type === 'fridge' ? [1550] : c.type === 'pantry' ? [1400] : c.type === 'oven' ? [500, 1120, 1500] : []
        splits.forEach((s, k) => g.push(<line key={'s' + k} className="split" x1={X(x)} x2={X(x + c.w)} y1={Y(s)} y2={Y(s)} />))
        if (c.fronts.filter(f => f.kind === 'door').length >= 2 && !['fridge', 'pantry'].includes(c.type)) g.push(<line key="v" className="split" x1={X(x + c.w / 2)} x2={X(x + c.w / 2)} y1={Y(100)} y2={Y(top)} />)
        if (c.type === 'oven') g.push(rect(x + 20, c.w - 40, 520, 1110, 'dev', 'o'))
        g.push(<text key="n" className="no" x={X(x + c.w / 2)} y={Y(top) - 90} fontSize={70} textAnchor="middle">{c.no}</text>)
        return <g key={c.no}>{g}</g>
      })}
      {(() => { const segs: Array<[number, number]> = []; let from: number | null = null, a = 0; for (const { c } of placed) { if (isTall(c.type as never)) { if (from != null) segs.push([from, a]); from = null } else if (from == null) from = a; a += c.w } if (from != null) segs.push([from, a]); return segs.map(([s, e], i) => rect(s, e - s, 870, 900, 'top', 't' + i)) })()}
      {uppers.map(({ c, x }) => <g key={'u' + c.no}>{rect(x, c.w, 1450, 2150, 'cab', 'u')}<text className="no" x={X(x + c.w / 2)} y={Y(2150) - 60} fontSize={70} textAnchor="middle">{c.no}</text></g>)}
      {/* dimension chains: modules, overall; heights on the side */}
      {placed.map(({ c, x }) => <Dim key={'d' + c.no} x1={Math.min(X(x), X(x + c.w))} x2={Math.max(X(x), X(x + c.w))} y={Y(0) + 260} label={mm(c.w)} s={S} />)}
      <Dim x1={0} x2={L} y={Y(0) + 560} label={`${mm(L)}`} s={S} />
      {[0, 100, 870, 900, 1450, 2150, 2200].reduce<Array<[number, number]>>((acc, v, i, arr) => (i ? [...acc, [arr[i - 1], v]] : acc), []).map(([a, b]) => <Dim key={'h' + a} x1={Y(b)} x2={Y(a)} y={L + 260} label={mm(b - a)} s={S} vertical />)}
    </svg>
  )
}

function PlanView({ house, run, cabs }: { house: House; run: Run; cabs: Cabinet[] }) {
  const S = 25, k = 10 / PX_PER_CM                                     // plan px → mm
  const fp = runFootprint(run)
  const fl = house.floors[run.floor]
  const room = fl.rooms.slice(0, fl.indoor).find(r => r[2] <= fp[0] + 2 && r[4] >= fp[2] - 2 && r[3] <= fp[1] + 2 && r[5] >= fp[3] - 2) ?? ['', '', fp[0], fp[1], fp[2], fp[3]]
  const bx = [Math.min(room[2], fp[0]) - 40, Math.min(room[3], fp[1]) - 40, Math.max(room[4], fp[2]) + 40, Math.max(room[5], fp[3]) + 40]
  const w = (bx[2] - bx[0]) * k, h = (bx[3] - bx[1]) * k
  const P = (x: number, y: number) => [(x - bx[0]) * k, (y - bx[1]) * k]
  const island = house.items.find(it => it.f === run.floor && it.k === 'model' && it.name === 'island') as { r: number[] } | undefined
  const lower = cabs.filter(c => c.type !== 'upper')
  let at = 0
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: `${w / S}mm`, height: `${h / S}mm` }} className="drawing">
      <defs><clipPath id={`clip-${run.id}`}><rect x={0} y={0} width={w} height={h} /></clipPath></defs>
      <g clipPath={`url(#clip-${run.id})`}>
        {fl.walls.map((poly, i) => <polygon key={i} className="wall" points={poly.map(([x, y]) => P(x, y).join(',')).join(' ')} />)}
        {fl.glass.map((g, i) => { const [x1, y1] = P(g[0], g[1]), [x2, y2] = P(g[2], g[3]); return <rect key={'g' + i} className="glass" x={x1} y={y1} width={x2 - x1} height={y2 - y1} /> })}
      </g>
      {lower.map(c => {
        const a = at; at += c.w
        const along = (run.axis === 'x' ? run.x : run.y) + a / 10 * PX_PER_CM, len = c.w / 10 * PX_PER_CM
        const r = run.axis === 'y' ? [fp[0], along, fp[2], along + len] : [along, fp[1], along + len, fp[3]]
        const [x1, y1] = P(r[0], r[1]), [x2, y2] = P(r[2], r[3])
        return <g key={c.no}><rect className={isTall(c.type as never) ? 'cab tall' : 'cab'} x={x1} y={y1} width={x2 - x1} height={y2 - y1} /><text className="no" x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 25} fontSize={70} textAnchor="middle">{c.no}</text></g>
      })}
      {island && (() => { const [x1, y1] = P(island.r[0], island.r[1]), [x2, y2] = P(island.r[2], island.r[3]); return <g><rect className="island" x={x1} y={y1} width={x2 - x1} height={y2 - y1} /><text className="lbl" x={(x1 + x2) / 2} y={(y1 + y2) / 2} fontSize={60} textAnchor="middle">אי</text></g> })()}
      {(() => {
        const [x1, y1] = P(fp[0], fp[1]), [x2, y2] = P(fp[2], fp[3])
        const out: React.ReactElement[] = []
        if (run.axis === 'y') {
          out.push(<Dim key="len" x1={y1} x2={y2} y={x1 - 260} label={mm(run.length * 10)} s={S} vertical />)
          out.push(<Dim key="dep" x1={x1} x2={x2} y={y1 - 150} label={mm(run.depth * 10)} s={S} />)
          if (island) { const [ix] = P(island.r[run.facing > 0 ? 0 : 2], 0); const gap = Math.abs(ix - (run.facing > 0 ? x2 : x1)); out.push(<Dim key="walk" x1={Math.min(ix, run.facing > 0 ? x2 : x1)} x2={Math.max(ix, run.facing > 0 ? x2 : x1)} y={(y1 + y2) / 2} label={`מעבר ${mm(gap)}`} s={S} />) }
        } else {
          out.push(<Dim key="len" x1={x1} x2={x2} y={y1 - 260} label={mm(run.length * 10)} s={S} />)
          out.push(<Dim key="dep" x1={y1} x2={y2} y={x1 - 150} label={mm(run.depth * 10)} s={S} vertical />)
        }
        return out
      })()}
    </svg>
  )
}

function CutTable({ list }: { list: Panel[] }) {
  return (
    <table className="grid small">
      <thead><tr><th>ארון</th><th>חלק</th><th>אורך</th><th>רוחב</th><th>כמות</th><th>קנט</th><th>סיבים</th></tr></thead>
      <tbody>{list.map((p, i) => <tr key={i}><td className="n">{p.cab}</td><td>{p.name}</td><td className="n">{mm(Math.max(p.w, p.h))}</td><td className="n">{mm(Math.min(p.w, p.h))}</td><td className="n">{p.qty}</td><td>{p.edges === '4' ? 'היקפי' : p.edges === 'L' ? 'צד ארוך' : '—'}</td><td>{p.grain ? (p.h >= p.w ? 'לאורך' : 'לרוחב') : ''}</td></tr>)}</tbody>
    </table>
  )
}

function Sheets({ layout }: { layout: SheetLayout }) {
  const W = SHEET.w - 2 * SHEET.trim, H = SHEET.h - 2 * SHEET.trim
  return (
    <div className="boards">
      {layout.sheets.map((s, i) => (
        <figure key={i}>
          <svg viewBox={`0 0 ${W} ${H}`} className="board">
            <rect className="sheetbg" x={0} y={0} width={W} height={H} />
            {s.map((p, k) => <g key={k}><rect className="piece" x={p.x} y={p.y} width={p.w} height={p.h} />{p.w > 260 && p.h > 120 && <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 25} fontSize={Math.min(70, p.h / 3)} textAnchor="middle">{p.label} {Math.round(p.w)}×{Math.round(p.h)}</text>}</g>)}
          </svg>
          <figcaption>לוח {i + 1} מתוך {layout.sheets.length}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function TopView({ p }: { p: WorktopPiece }) {
  const S = 20, pad = 500, w = p.length + pad * 2, h = p.depth + pad * 2
  return (
    <svg viewBox={`${-pad} ${-pad} ${w} ${h}`} style={{ width: `${Math.min(w / S, 390)}mm` }} className="drawing">
      <rect className="topslab" x={0} y={0} width={p.length} height={p.depth} />
      <text className="lbl" x={p.length / 2} y={-pad / 2} fontSize={70} textAnchor="middle">קיר</text>
      <text className="lbl" x={p.length / 2} y={p.depth + pad * .85} fontSize={70} textAnchor="middle">חזית</text>
      {p.cutouts.map((c, i) => (
        <g key={i}>
          <rect className="cutout" x={c.x - c.w / 2} y={c.y - c.d / 2} width={c.w} height={c.d} rx={c.kind === 'sink' ? 40 : 0} />
          <text x={c.x} y={c.y + 25} fontSize={70} textAnchor="middle">{c.kind === 'sink' ? 'כיור' : 'כיריים'} {c.w}×{c.d}</text>
          <Dim x1={0} x2={c.x} y={p.depth + 150 + i * 160} label={`${mm(c.x)} למרכז`} s={S} />
          <Dim x1={c.y} x2={p.depth} y={c.x + c.w / 2 + 120} label={mm(p.depth - c.y)} s={S} vertical />
        </g>
      ))}
      <Dim x1={0} x2={p.length} y={-150} label={mm(p.length)} s={S} />
      <Dim x1={0} x2={p.depth} y={-150} label={mm(p.depth)} s={S} vertical />
    </svg>
  )
}
