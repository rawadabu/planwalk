import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type HouseRow, type NewShare, type ProjectDetail, type ShareRow, type UnitStatus } from '../../api'

const ROLE_CAN = {
  edit: ['owner', 'admin', 'architect'], upload: ['owner', 'admin', 'architect'], unit: ['owner', 'admin', 'sales'], share: ['owner', 'admin', 'architect', 'sales'],
}
const STATUS_LABEL: Record<string, string> = { uploaded: 'Uploaded · waiting for processing', extracting: 'Reading walls from the plans', review: 'Needs review', furnishing: 'Furnishing', ready: 'Ready', failed: 'Failed' }
const ils = (n: number | null) => (n == null ? '—' : '₪' + n.toLocaleString('en-US'))

export default function ProjectPage() {
  const { id = '' } = useParams()
  const [p, setP] = useState<ProjectDetail | null>(null), [error, setError] = useState<string | null>(null)
  const load = () => api.project(id).then(setP).catch(e => setError(e.message))
  useEffect(() => { load() }, [id])
  useEffect(() => { if (p) document.title = `${p.name} · Planwalk` }, [p])
  if (error) return <main className="wrap dash"><p className="bad">{error}</p><Link to="/app">Back to projects</Link></main>
  if (!p) return <main className="wrap app-loading">Loading…</main>
  const can = (k: keyof typeof ROLE_CAN) => ROLE_CAN[k].includes(p.role)

  return (
    <main className="wrap project">
      <header>
        <Link to="/app" className="back">← Projects</Link>
        <div className="eyebrow">{p.kind === 'development' ? 'Development' : 'Private home'}{p.address ? ` · ${p.address}` : ''} · your role: {p.role}</div>
        <h1>{p.name}</h1>
      </header>

      <section>
        <h2>3D models</h2>
        {p.houses.length === 0 ? <p className="empty">No 3D model yet. Upload the plans below; the model appears here when processing finishes.</p> : (
          <div className="houses">{p.houses.map(h => <HouseCard key={h.id} house={h} canShare={can('share')} />)}</div>
        )}
      </section>

      <section>
        <h2>Location</h2>
        <LocationForm p={p} canEdit={can('edit')} onDone={load} />
      </section>

      <section>
        <h2>Units</h2>
        <UnitsTable p={p} canEditUnits={can('unit')} canAdd={can('edit')} onChange={load} />
      </section>

      <section>
        <h2>Plans</h2>
        {can('upload') && <UploadForm projectId={p.id} onDone={load} />}
        {p.uploads.length === 0 ? <p className="empty">No plans uploaded yet.</p> : (
          <ul className="rows">{p.uploads.map(u => (
            <li key={u.id}><span><b>{u.fileName}</b><small>{(u.sizeBytes / 1e6).toFixed(1)} MB · {new Date(u.createdAt).toLocaleDateString()}</small></span><em className={`st st-${u.status}`}>{STATUS_LABEL[u.status] ?? u.status}</em></li>
          ))}</ul>
        )}
      </section>
    </main>
  )
}

function HouseCard({ house, canShare }: { house: HouseRow; canShare: boolean }) {
  const [open, setOpen] = useState(false), [shares, setShares] = useState<ShareRow[]>([]), [created, setCreated] = useState<NewShare | null>(null)
  const [days, setDays] = useState('30'), [label, setLabel] = useState(''), [copied, setCopied] = useState(false), [error, setError] = useState<string | null>(null)
  const load = () => api.shares(house.id).then(setShares).catch(e => setError(e.message))
  useEffect(() => { if (open) load() }, [open])
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    try { setCreated(await api.createShare(house.id, { permission: 'view', expiresInDays: days === 'never' ? null : Number(days), label: label || undefined })); setLabel(''); setCopied(false); load() }
    catch (err) { setError((err as Error).message) }
  }
  const url = created ? location.origin + created.path : ''
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true) } catch { setCopied(false) } }
  return (
    <div className="house">
      <div className="house-head">
        <span><b>{house.title}</b><small>{house.public ? 'Public demo' : 'Private · members and share links only'}</small></span>
        <Link className="btn sm primary" to={`/h/${house.id}`}>Open walkthrough</Link>
        {canShare && <button className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>Share</button>}
      </div>
      {open && (
        <div className="share">
          <form onSubmit={create}>
            <label htmlFor={`l-${house.id}`}>Who is it for? <small>(optional)</small></label>
            <input id={`l-${house.id}`} value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Cohen family" />
            <label htmlFor={`d-${house.id}`}>Link works for</label>
            <select id={`d-${house.id}`} value={days} onChange={e => setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="never">No expiry</option></select>
            <button className="btn sm primary">Create link</button>
          </form>
          {created && (
            <div className="newlink" role="status">
              <p>Copy the link now. For security it is shown only once.</p>
              <div><input readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Share link" /><button className="btn sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
            </div>
          )}
          {error && <p className="bad" role="alert">{error}</p>}
          {shares.length > 0 && (
            <ul className="rows">{shares.map(s => (
              <li key={s.id}>
                <span><b>{s.label || 'Unnamed link'}</b><small>{s.revokedAt ? 'Turned off' : s.expiresAt ? `Expires ${new Date(s.expiresAt).toLocaleDateString()}` : 'No expiry'} · created {new Date(s.createdAt).toLocaleDateString()}</small></span>
                {!s.revokedAt && <button className="btn sm" onClick={async () => { await api.revokeShare(s.id); load() }}>Turn off</button>}
              </li>
            ))}</ul>
          )}
        </div>
      )}
    </div>
  )
}

function UnitsTable({ p, canEditUnits, canAdd, onChange }: { p: ProjectDetail; canEditUnits: boolean; canAdd: boolean; onChange: () => void }) {
  const [f, setF] = useState({ number: '', buildingName: '', floor: '', rooms: '', areaM2: '', priceIls: '', houseId: '' }), [error, setError] = useState<string | null>(null)
  const bname = (id: string | null) => p.buildings.find(b => b.id === id)?.name ?? '—'
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s))
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    try {
      await api.createUnit(p.id, { number: f.number, buildingName: f.buildingName || undefined, floor: num(f.floor), rooms: num(f.rooms), areaM2: num(f.areaM2), priceIls: num(f.priceIls), houseId: f.houseId || undefined })
      setF({ number: '', buildingName: '', floor: '', rooms: '', areaM2: '', priceIls: '', houseId: '' }); onChange()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Unit</th><th>Building</th><th className="r">Floor</th><th className="r">Rooms</th><th className="r">Area</th><th className="r">Price</th><th>3D</th><th>Status</th></tr></thead>
          <tbody>
            {p.units.length === 0 && <tr><td colSpan={8} className="empty">No units yet.</td></tr>}
            {p.units.map(u => (
              <tr key={u.id}>
                <td><b>{u.number}</b></td><td>{bname(u.buildingId)}</td><td className="r">{u.floor ?? '—'}</td><td className="r">{u.rooms ?? '—'}</td>
                <td className="r">{u.areaM2 ? `${u.areaM2} m²` : '—'}</td><td className="r">{ils(u.priceIls)}</td>
                <td>{u.houseId ? <Link to={`/h/${u.houseId}`}>Walk</Link> : '—'}</td>
                <td>{canEditUnits ? (
                  <select aria-label={`Status of unit ${u.number}`} value={u.status} onChange={async e => { await api.updateUnit(u.id, { status: e.target.value as UnitStatus }); onChange() }}>
                    <option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
                  </select>
                ) : <span className={`st st-${u.status}`}>{u.status}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAdd && (
        <form className="unitform" onSubmit={add}>
          <input aria-label="Unit number" placeholder="Unit no." value={f.number} onChange={e => setF({ ...f, number: e.target.value })} required maxLength={20} />
          <input aria-label="Building" placeholder="Building" value={f.buildingName} onChange={e => setF({ ...f, buildingName: e.target.value })} maxLength={60} />
          <input aria-label="Floor" placeholder="Floor" inputMode="numeric" value={f.floor} onChange={e => setF({ ...f, floor: e.target.value })} />
          <input aria-label="Rooms" placeholder="Rooms" inputMode="decimal" value={f.rooms} onChange={e => setF({ ...f, rooms: e.target.value })} />
          <input aria-label="Area in square metres" placeholder="m²" inputMode="decimal" value={f.areaM2} onChange={e => setF({ ...f, areaM2: e.target.value })} />
          <input aria-label="Price in shekels" placeholder="Price ₪" inputMode="numeric" value={f.priceIls} onChange={e => setF({ ...f, priceIls: e.target.value })} />
          <select aria-label="3D model" value={f.houseId} onChange={e => setF({ ...f, houseId: e.target.value })}><option value="">No 3D model</option>{p.houses.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}</select>
          <button className="btn sm primary">Add unit</button>
          {error && <p className="bad" role="alert">{error}</p>}
        </form>
      )}
    </>
  )
}

function UploadForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <form className="uploadrow" onSubmit={async e => {
      e.preventDefault(); const input = (e.currentTarget.elements.namedItem('pdf') as HTMLInputElement); const file = input.files?.[0]
      if (!file) return; setBusy(true); setMsg(null)
      try { await api.uploadPlans(projectId, file); setMsg({ ok: true, text: `${file.name} uploaded. Processing starts automatically.` }); input.value = ''; onDone() }
      catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
    }}>
      <label htmlFor="pdf">Architect's plans (PDF, up to 50 MB)</label>
      <div><input id="pdf" name="pdf" type="file" accept="application/pdf" required /><button className="btn sm primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button></div>
      {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
    </form>
  )
}

// Address → coordinates (for the real sun path in the walkthrough) and which way the plan faces.
function LocationForm({ p, canEdit, onDone }: { p: ProjectDetail; canEdit: boolean; onDone: () => void }) {
  const [address, setAddress] = useState(p.address ?? ''), [lat, setLat] = useState(p.lat?.toString() ?? ''), [lng, setLng] = useState(p.lng?.toString() ?? '')
  const [north, setNorth] = useState((p.northDeg ?? 0).toString())
  const [hits, setHits] = useState<Array<{ label: string; lat: number; lng: number }>>([]), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false)
  if (!canEdit) return <p className="empty">{p.lat != null ? `${p.address ?? ''} (${p.lat.toFixed(4)}, ${p.lng?.toFixed(4)}) · plan north ${p.northDeg ?? 0}°` : 'No location yet.'}</p>
  const search = async () => {
    setBusy(true); setMsg(null); setHits([])
    try { const r = await api.geocode(address); setHits(r); if (!r.length) setMsg({ ok: false, text: 'No match. Try the city and street, or type the coordinates.' }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null)
    const la = lat.trim() ? Number(lat) : null, ln = lng.trim() ? Number(lng) : null, n = Number(north) || 0
    if ((la == null) !== (ln == null) || (la != null && (isNaN(la) || isNaN(ln!)))) { setMsg({ ok: false, text: 'Enter both latitude and longitude, as numbers.' }); return }
    try { await api.updateProject(p.id, { address: address.trim() || null, lat: la, lng: ln, northDeg: n }); setMsg({ ok: true, text: 'Saved. The walkthrough now shows the real sun for this place.' }); onDone() }
    catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
  }
  return (
    <form className="locform" onSubmit={save}>
      <label>Address<span className="inline"><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, city" /><button type="button" className="btn sm" disabled={busy || address.trim().length < 3} onClick={search}>{busy ? 'Searching…' : 'Find'}</button></span></label>
      {hits.length > 0 && <ul className="hits">{hits.map((h, i) => <li key={i}><button type="button" onClick={() => { setLat(h.lat.toFixed(6)); setLng(h.lng.toFixed(6)); setHits([]) }}>{h.label}</button></li>)}</ul>}
      <div className="grid3">
        <label>Latitude<input inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)} placeholder="32.1663" /></label>
        <label>Longitude<input inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)} placeholder="34.8433" /></label>
        <label>North on the plan<input inputMode="decimal" value={north} onChange={e => setNorth(e.target.value)} placeholder="0" /><small>degrees clockwise from the top of the sheet (the north arrow)</small></label>
      </div>
      <button className="btn sm primary">Save location</button>
      {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
    </form>
  )
}
