import { useEffect, useState } from 'react'
import { FINISHES, MODULES, type PriceBook } from '@planwalk/design'
import { api } from '../../api'
import { useApp } from './AppShell'

type Book = Partial<PriceBook> & Record<string, any>
const MOD_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, v.en])), upper: 'Wall unit', hood: 'Cooker hood' }

/** The organisation's price book (sheet A-06): what every quote in its projects is priced with. */
export default function Prices() {
  const { orgId } = useApp()
  const [defaults, setDefaults] = useState<PriceBook | null>(null)
  const [book, setBook] = useState<Book>({}), [canEdit, setCanEdit] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { api.orgPrices(orgId).then(r => { setDefaults(r.defaults); setBook(r.prices ?? {}); setCanEdit(r.canEdit) }).catch(e => setMsg({ ok: false, text: e.message })) }, [orgId])
  useEffect(() => { document.title = 'Price book · Planwalk' }, [])
  if (!defaults) return <main className="wrap app-loading">{msg?.text ?? 'Loading…'}</main>

  const val = (sec: string | null, key: string) => (sec ? book[sec]?.[key] : book[key]) ?? (sec ? (defaults as any)[sec][key] : (defaults as any)[key])
  const isOwn = (sec: string | null, key: string) => (sec ? book[sec]?.[key] : book[key]) != null
  const set = (sec: string | null, key: string, v: string) => {
    const n = v === '' ? undefined : Number(v)
    if (n != null && !(n >= 0)) return
    setBook(b => sec ? { ...b, [sec]: { ...(b[sec] ?? {}), [key]: n } } : { ...b, [key]: n })
  }
  const clean = (b: Book) => JSON.parse(JSON.stringify(b, (_k, v) => (v === undefined ? undefined : v)))
  const save = async () => {
    setBusy(true); setMsg(null)
    try { const r = await api.saveOrgPrices(orgId, clean(book)); setBook(r.prices); setMsg({ ok: true, text: 'Saved. New quotes use these prices.' }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const field = (sec: string | null, key: string, label: string, unit: string, step = 1) => (
    <tr key={(sec ?? '') + key}>
      <td>{label}</td>
      <td className="r"><input type="number" min={0} step={step} disabled={!canEdit} id={`p-${sec ?? 'x'}-${key}`} aria-label={label}
        value={isOwn(sec, key) ? val(sec, key) : ''} placeholder={String(val(sec, key))} onChange={e => set(sec, key, e.target.value)} /></td>
      <td className="u">{unit}</td>
    </tr>
  )
  const finishes = FINISHES.filter(f => f.id in defaults.finishes)
  return (
    <main className="wrap prices">
      <div className="phead">
        <div className="eyebrow">Organisation settings</div>
        <h1>Price book</h1>
        <p className="lede">Prices before VAT, material and labour together. Empty fields use the example price shown in grey. Every design's live cost and the carpenter quote use this book.</p>
      </div>
      <div className="psec">
        <h2>Surfaces</h2>
        <table className="ptable"><tbody>
          {finishes.map(f => field('finishes', f.id, `${f.en} · ${f.he}`, f.category === 'stone' ? '₪ / m (worktop)' : '₪ / m²'))}
        </tbody></table>
      </div>
      <div className="psec">
        <h2>Kitchen</h2>
        <table className="ptable"><tbody>
          {Object.keys(defaults.modules).map(k => field('modules', k, MOD_LABEL[k] ?? k, k === 'filler' ? '₪ each' : '₪ per 60 cm'))}
          {field(null, 'kitchenInstallPerM', 'Installation', '₪ / m of run')}
          {Object.keys(defaults.fronts).map(k => field('fronts', k, `Fronts: ${FINISHES.find(f => f.id === k)?.en ?? k}`, '× cabinet price', .05))}
        </tbody></table>
      </div>
      <div className="psec">
        <h2>Changes and windows</h2>
        <table className="ptable"><tbody>
          {Object.keys(defaults.windowPerM2).map(k => field('windowPerM2', k, `Window, ${FINISHES.find(f => f.id === k)?.en ?? k}`, '₪ / m²'))}
          {field(null, 'windowChangeFee', 'Changing an opening (site work)', '₪ each')}
          {field(null, 'wallMovePerM2', 'Moving a partition', '₪ / m² of wall')}
          {field(null, 'vat', 'VAT', 'fraction (0.18 = 18%)', .01)}
        </tbody></table>
      </div>
      <div className="savebar">
        {canEdit ? <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save prices'}</button> : <span className="empty">Only owners and admins can change prices.</span>}
        {msg && <span className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</span>}
      </div>
    </main>
  )
}
