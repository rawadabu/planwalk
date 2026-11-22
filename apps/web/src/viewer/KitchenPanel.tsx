import { useMemo, useState } from 'react'
import type { Viewer } from '@planwalk/engine'
import type { House, StoreyId } from '@planwalk/house'
import { MODULES, PX_PER_CM, applyEdits, autoFill, checkRun, editKey, isTall, runUsed, runsFromPlan, windowsBehind, type Module, type ModuleType, type Run } from '@planwalk/design'
import { renderDesign, type DesignSession } from './DesignPanel'
import { CostChip, useCost } from './Cost'
import { STATIC } from '../api'

const TYPES = Object.keys(MODULES).filter(t => t !== 'filler') as ModuleType[]
const kitchenRoom = (h: House) => {
  for (const f of [1, 0, 2] as StoreyId[]) { const i = h.floors[f].rooms.findIndex((r, n) => n < h.floors[f].indoor && r[0] === 'מטבח'); if (i >= 0) return { floor: f, room: i } }
  return null
}

/**
 * Kitchen designer (sheet A-05): the runs along the kitchen walls, module by module, with an elevation drawing.
 * Runs live in the design (edits "run:…"), so undo/redo, saving and versions work as for everything else.
 */
export function KitchenPanel({ viewer, house, houseId, prices, session, onHouse, onClose, onCost }: { viewer: Viewer; house: House; houseId: string; prices?: Record<string, unknown> | null; session: DesignSession; onHouse: (h: House) => void; onClose: () => void; onCost: () => void }) {
  const doc = session.doc
  const [, bump] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [which, setWhich] = useState(0)
  const show = () => { renderDesign(viewer, house, session, onHouse, doc.design); bump(n => n + 1) }
  const runs = Object.entries(doc.design.edits).filter(([, e]) => e.k === 'run') as Array<[string, Run]>
  const eff = useMemo(() => applyEdits(house, doc.design.edits).house, [house, doc.design.edits])
  const k = kitchenRoom(house)
  const cost = useCost(house, doc.design, prices as never)

  const start = () => {
    if (!k) return
    const found = runsFromPlan(house, k.floor, k.room)
    if (doc.apply(found.map(r => ({ target: 'edit:' + editKey(r), id: JSON.stringify(r) })))) show()
    if (found[0]) look(found[0])
  }
  const look = (r: Run) => {
    // stand 2.3 m in front of the middle of the run, facing it
    const mid = r.length / 2 * PX_PER_CM, off = (r.depth + 230) * PX_PER_CM * r.facing
    const x = r.axis === 'y' ? r.x + off : r.x + mid, y = r.axis === 'y' ? r.y + mid : r.y + off
    const dx = r.axis === 'y' ? -r.facing : 0, dy = r.axis === 'x' ? -r.facing : 0
    viewer.goTo(r.floor, x, y, Math.atan2(-dx, -dy))
  }

  if (!runs.length) return (
    <section className="panel drawer kitchen" aria-label="מתכנן מטבח">
      <header><h2>מטבח</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      {k ? <>
        <p className="fine">נתחיל מהמטבח שבתוכנית: האורך של כל קיר נלקח מהשרטוט, והארונות מסודרים במידות סטנדרטיות. אחר כך אפשר לשנות כל ארון.</p>
        <button className="btn primary wide" onClick={start}>התחלה מהתוכנית</button>
      </> : <p className="fine">לא נמצא חדר בשם מטבח בבית הזה.</p>}
    </section>
  )

  const [key, run] = runs[Math.min(which, runs.length - 1)]
  const set = (next: Run) => { if (doc.setEdit(key, next)) show() }
  const mods = run.modules
  const update = (i: number, m: Module | null) => { const list = [...mods]; if (m) list[i] = m; else list.splice(i, 1); set({ ...run, modules: list }) }
  const swap = (i: number, j: number) => { if (j < 0 || j >= mods.length) return; const list = [...mods]; [list[i], list[j]] = [list[j], list[i]]; set({ ...run, modules: list }); setSel(j) }
  const issues = checkRun(run, eff)
  const used = runUsed(run)

  return (
    <section className="panel drawer kitchen" aria-label="מתכנן מטבח">
      <header><h2>מטבח</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      {runs.length > 1 && <div className="seg2">{runs.map(([kk], i) => <button key={kk} className="btn" aria-pressed={i === which} onClick={() => setWhich(i)}>קיר {i + 1}</button>)}</div>}
      <div className="krow"><span>קיר {run.length} ס״מ · עומק {run.depth} ס״מ</span><button className="btn" onClick={() => look(run)}>הצגה בבית</button></div>
      <Elevation run={run} house={eff} sel={sel} onSel={setSel} />
      <div className={'used' + (used > run.length ? ' over' : '')}>בשימוש {used} מתוך {run.length} ס״מ{run.length - used > 0 ? ` · נשארו ${run.length - used}` : ''}</div>

      <ol className="mods">
        {mods.map((m, i) => (
          <li key={i} className={sel === i ? 'on' : ''} onClick={() => setSel(i)}>
            <span className="n">{i + 1}</span>
            {m.t === 'filler' ? <span className="ftype">{MODULES.filler.he}</span> :
              <select value={m.t} aria-label={`סוג ארון ${i + 1}`} onChange={e => { const t = e.target.value as ModuleType; const ws = MODULES[t].widths; update(i, { t, w: ws.includes(m.w) ? m.w : ws.reduce((a, w) => Math.abs(w - m.w) < Math.abs(a - m.w) ? w : a, ws[0]) }) }}>
                {TYPES.map(t => <option key={t} value={t}>{MODULES[t].he}</option>)}
              </select>}
            {m.t === 'filler'
              ? <input className="fw" inputMode="numeric" value={m.w} aria-label={`רוחב השלמה ${i + 1}`} onChange={e => { const w = Number(e.target.value); if (w > 0) update(i, { ...m, w }) }} />
              : <select value={m.w} aria-label={`רוחב ארון ${i + 1}`} onChange={e => update(i, { ...m, w: Number(e.target.value) })}>
                  {MODULES[m.t].widths.map(w => <option key={w} value={w}>{w}</option>)}
                </select>}
            <span className="unit">ס״מ</span>
            <span className="acts">
              <button className="btn" onClick={e => { e.stopPropagation(); swap(i, i - 1) }} aria-label="הזזה אחורה" disabled={i === 0}>‹</button>
              <button className="btn" onClick={e => { e.stopPropagation(); swap(i, i + 1) }} aria-label="הזזה קדימה" disabled={i === mods.length - 1}>›</button>
              <button className="btn" onClick={e => { e.stopPropagation(); update(i, null); setSel(null) }} aria-label="הסרה">✕</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="row2">
        <button className="btn" onClick={() => set({ ...run, modules: [...mods, { t: 'drawers', w: 60 }] })}>+ ארון</button>
        <button className="btn" onClick={() => set({ ...run, modules: [...mods, { t: 'filler', w: 5 }] })}>+ השלמה</button>
        <button className="btn" onClick={() => set({ ...run, modules: autoFill(run.length, { tallStart: mods[0] && isTall(mods[0].t) ? [mods[0].t] : [], tallEnd: mods.length > 1 && isTall(mods[mods.length - 1].t) ? [mods[mods.length - 1].t] : [] }) })}>סידור אוטומטי</button>
      </div>
      <label className="check"><input type="checkbox" checked={run.uppers} onChange={e => set({ ...run, uppers: e.target.checked })} /> ארונות עליונים (לא מול חלון)</label>
      {issues.length > 0 && <ul className="issues">{issues.map((i, n) => <li key={n} className={i.level}>{he(i.message)}</li>)}</ul>}
      <div className="dfoot">
        <button className="btn" disabled={!doc.canUndo} onClick={() => { if (doc.undo()) show() }}>↶ ביטול</button>
        <button className="btn" disabled={!doc.canRedo} onClick={() => { if (doc.redo()) show() }}>↷ חזרה</button>
        <span className="grow" />
        <button className="btn reset" onClick={() => { if (doc.setEdit(key, null)) show() }}>חזרה למטבח שבתוכנית</button>
      </div>
      <CostChip report={cost} houseId={houseId} onOpen={onCost} />
      <button className="btn primary wide" onClick={() => {
        // hand the current design to the drawing set (a new tab; works without a server too)
        try { localStorage.setItem(`planwalk.sheet.${houseId}`, JSON.stringify({ design: doc.design, name: session.active?.name ?? 'המטבח שלי', version: session.active?.version ?? null, at: new Date().toISOString() })) } catch { /* private mode: the sheets show the plan kitchen */ }
        window.open(STATIC ? `#/h/${houseId}/sheets` : `/h/${houseId}/sheets`, '_blank')
      }}>PDF לנגר</button>
      <p className="fine">שמירה וגרסאות: בחלונית "עיצוב". המטבח הוא חלק מהעיצוב.</p>
    </section>
  )
}

// The rules speak English in the package (they also go into the carpenter PDF); the panel shows Hebrew.
function he(msg: string) {
  return msg
    .replace(/^The cabinets are (\d+) cm longer than the wall \((\d+) cm\)$/, 'הארונות ארוכים מהקיר ב-$1 ס״מ (קיר $2 ס״מ)')
    .replace(/^(\d+) cm left over: add a unit or a filler$/, 'נשארו $1 ס״מ: להוסיף ארון או השלמה')
    .replace(/^Fillers are 1–15 cm$/, 'השלמה היא בין 1 ל-15 ס״מ')
    .replace(/^(.+) doesn't come (\d+) cm wide$/, 'אין ארון כזה ברוחב $2 ס״מ')
    .replace(/^Keep at least 30 cm of worktop between the hob and a tall unit$/, 'צריך לפחות 30 ס״מ משטח בין הכיריים לארון גבוה')
    .replace(/^Hob right next to the sink: keep 40 cm of worktop between them$/, 'כיריים צמודות לכיור: כדאי 40 ס״מ משטח ביניהם')
    .replace(/^Hob at the end of the run: keep 30 cm to the wall$/, 'כיריים בקצה: צריך 30 ס״מ עד הקיר')
    .replace(/^Put the dishwasher next to the sink \(water and drain\)$/, 'המדיח צריך להיות ליד הכיור (מים וניקוז)')
    .replace(/^No sink in this run$/, 'אין כיור בקיר הזה')
    .replace(/^Two hobs in one run$/, 'שתי כיריים באותו קיר')
    .replace(/^Only (\d+) cm to walk in front of the cabinets.*$/, 'רק $1 ס״מ מעבר מול הארונות (מינימום 90, נוח 100–120)')
}

/** Front view of the run, to scale, with module widths and the window behind it. */
function Elevation({ run, house, sel, onSel }: { run: Run; house: House; sel: number | null; onSel: (i: number) => void }) {
  const W = 300, pad = 8, s = (W - pad * 2) / Math.max(run.length, 1), Hs = 0.55       // px per cm, vertical squeeze for the panel
  const y = (cm: number) => 150 - cm * s * Hs * 1.9
  // drawn as seen standing in front of it: for some walls the run's start is on the viewer's right
  const mirror = run.axis === 'y' ? run.facing > 0 : run.facing < 0
  const win = windowsBehind(house, run)
  let at = 0
  return (
    <svg className="elev" viewBox={`0 0 ${W} 168`} role="img" aria-label="שרטוט חזית של המטבח, כפי שרואים אותו מולו">
     <g transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined}>
      {win.map(([a, b], i) => <rect key={i} x={pad + Math.max(0, a) * s} y={y(230)} width={(Math.min(run.length, b) - Math.max(0, a)) * s} height={y(100) - y(230)} className="win" />)}
      <line x1={pad} x2={W - pad} y1={150} y2={150} className="floor" />
      {run.modules.map((m, i) => {
        const x = pad + at * s, w = m.w * s, h = isTall(m.t) ? 220 : 87
        at += m.w
        return (
          <g key={i} className={'m t-' + m.t + (sel === i ? ' on' : '')} onClick={() => onSel(i)}>
            <rect x={x} y={y(h)} width={w} height={y(0) - y(h)} />
            {m.t === 'sink' && <rect className="dev" x={x + w * .2} y={y(90) - 3} width={w * .6} height={3} />}
            {m.t === 'hob' && <rect className="dev dark" x={x + w * .15} y={y(90) - 2} width={w * .7} height={2} />}
            {m.t === 'oven' && <rect className="dev dark" x={x + 2} y={y(112)} width={w - 4} height={y(52) - y(112)} />}
            {run.uppers && !isTall(m.t) && m.t !== 'filler' && !win.some(([a, b]) => a < at && b > at - m.w) && (m.t === 'hob'
              ? <rect className="hood" x={x + w * .35} y={y(280)} width={w * .3} height={y(162) - y(280)} />
              : <rect x={x} y={y(215)} width={w} height={y(145) - y(215)} />)}
            <text x={x + w / 2} y={162} textAnchor="middle" transform={mirror ? `translate(${2 * (x + w / 2)} 0) scale(-1 1)` : undefined}>{m.w}</text>
          </g>
        )
      })}
      {(() => { let x = 0; const segs: Array<[number, number]> = []; let from: number | null = null
        run.modules.forEach(m => { if (isTall(m.t)) { if (from != null) segs.push([from, x]); from = null } else if (from == null) from = x; x += m.w }); if (from != null) segs.push([from, x])
        return segs.map(([a, b], i) => <rect key={i} className="top" x={pad + a * s} y={y(90)} width={(b - a) * s} height={y(87) - y(90) + .5} />) })()}
     </g>
    </svg>
  )
}
