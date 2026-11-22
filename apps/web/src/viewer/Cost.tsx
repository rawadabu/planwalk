import { useMemo, useState } from 'react'
import type { House } from '@planwalk/house'
import { costReport, emptyDesign, type CostReport, type Design, type PriceBook } from '@planwalk/design'

export const ils = (n: number) => (n < 0 ? '−' : '') + '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')
const UNIT: Record<string, string> = { 'm²': 'מ״ר', m: 'מ׳', pcs: 'יח׳', '': '' }
const budgetKey = (houseId: string) => `planwalk.budget.${houseId}`
export function readBudget(houseId: string) { try { const v = Number(localStorage.getItem(budgetKey(houseId))); return v > 0 ? v : null } catch { return null } }
function saveBudget(houseId: string, v: number | null) { try { v ? localStorage.setItem(budgetKey(houseId), String(v)) : localStorage.removeItem(budgetKey(houseId)) } catch { /* private mode */ } }

export function useCost(house: House, design: Design, prices?: Partial<PriceBook> | null): CostReport {
  return useMemo(() => costReport(house, design, prices), [house, design, prices])
}

/** One line under the design and kitchen panels: the price as you choose. */
export function CostChip({ report, houseId, onOpen }: { report: CostReport; houseId: string; onOpen: () => void }) {
  const budget = readBudget(houseId), over = budget != null && report.total > budget
  return (
    <button className={'costchip' + (over ? ' over' : '')} onClick={onOpen} aria-label="פירוט עלות">
      <span className="t">{ils(report.total)}</span>
      <span className="u">{report.upgrade > 0 ? `+${ils(report.upgrade)} מעל הבסיס` : report.upgrade < 0 ? `${ils(-report.upgrade)} פחות מהבסיס` : 'כמו הבסיס'}</span>
      {over && <span className="b">מעל התקציב ב-{ils(report.total - budget!)}</span>}
    </button>
  )
}

/** Cost panel (sheet A-06): total, change over the architect's base, budget, breakdown by room. */
export function CostPanel({ house, houseId, design, prices, onClose }: { house: House; houseId: string; design: Design; prices?: Partial<PriceBook> | null; onClose: () => void }) {
  const report = useCost(house, design, prices)
  const base = useMemo(() => costReport(house, emptyDesign(), prices), [house, prices])
  const [budget, setBudget] = useState<number | null>(() => readBudget(houseId))
  const [open, setOpen] = useState<string | null>(null)
  const baseBy = new Map(base.byGroup.map(g => [g.group, g.total]))
  const vatK = 1 + (report.vat / Math.max(1, report.net))
  const groups = [...report.byGroup].sort((a, b) => (b.total - (baseBy.get(b.group) ?? 0)) - (a.total - (baseBy.get(a.group) ?? 0)) || b.total - a.total)
  const pct = budget ? Math.min(100, report.total / budget * 100) : 0
  return (
    <section className="panel drawer cost" aria-label="עלות">
      <header><h2>עלות</h2><button className="btn x" onClick={onClose} aria-label="סגירה">✕</button></header>
      <div className="sum">
        <div><b>{ils(report.total)}</b><span>סה״כ כולל מע״מ</span></div>
        <div className={report.upgrade > 0 ? 'up' : ''}><b>{report.upgrade > 0 ? '+' : ''}{ils(report.upgrade)}</b><span>מעל הבסיס של האדריכל</span></div>
      </div>
      <label className="field">תקציב (כולל מע״מ)
        <input inputMode="numeric" value={budget ?? ''} placeholder="לדוגמה 180000" onChange={e => { const v = Number(e.target.value.replace(/[^\d]/g, '')) || null; setBudget(v); saveBudget(houseId, v) }} />
      </label>
      {budget && <div className={'bbar' + (report.total > budget ? ' over' : '')}><i style={{ width: pct + '%' }} /><span>{report.total > budget ? `מעל התקציב ב-${ils(report.total - budget)}` : `נשארו ${ils(budget - report.total)}`}</span></div>}
      <table className="groups">
        <tbody>
          {groups.map(g => {
            const d = (g.total - (baseBy.get(g.group) ?? 0)) * vatK
            return [
              <tr key={g.group} className="g" onClick={() => setOpen(open === g.group ? null : g.group)}>
                <td>{open === g.group ? '▾' : '▸'} {g.group}</td>
                <td className="num">{ils(g.total * vatK)}</td>
                <td className={'num d' + (d > 0 ? ' plus' : d < 0 ? ' minus' : '')}>{Math.abs(d) >= 1 ? (d > 0 ? '+' : '−') + ils(Math.abs(d)) : ''}</td>
              </tr>,
              open === g.group && report.lines.filter(l => l.group === g.group).map(l => (
                <tr key={l.key} className="l"><td>{l.item}<small>{l.qty} {UNIT[l.unit]} × {ils(l.unitPrice)}</small></td><td className="num">{ils(l.total * vatK)}</td><td /></tr>
              )),
            ]
          })}
        </tbody>
      </table>
      <p className="fine">לפני מע״מ {ils(report.net)} · מע״מ {ils(report.vat)}. {prices ? 'לפי המחירון של הארגון.' : 'מחירים לדוגמה עד שהארגון מגדיר מחירון.'} כמויות מחושבות מהשרטוט: שטח רצפה ותקרה, שטח קירות פחות חלונות, מטר משטח ומספר ארונות.</p>
      {report.missing.length > 0 && <p className="warnline">אין מחיר במחירון ל: {report.missing.join(', ')}</p>}
    </section>
  )
}
