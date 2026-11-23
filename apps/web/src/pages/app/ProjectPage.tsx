import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type Clients, type Feedback, type HouseRow, type NewInvite, type NewShare, type ProjectDetail, type ShareRow, type UnitStatus } from '../../api'

const ROLE_CAN = {
  edit: ['owner', 'admin', 'architect'], upload: ['owner', 'admin', 'architect'], unit: ['owner', 'admin', 'sales'], share: ['owner', 'admin', 'architect', 'sales'],
}
const STATUS_LABEL: Record<string, string> = { uploaded: 'Uploaded · waiting to build', extracting: 'Building the 3D model…', review: 'Needs your review', furnishing: 'Furnishing', ready: 'Reviewed · ready to share', failed: 'Failed' }
const ils = (n: number | null) => (n == null ? '—' : '₪' + n.toLocaleString('en-US'))

export default function ProjectPage() {
  const { id = '' } = useParams()
  const [p, setP] = useState<ProjectDetail | null>(null), [error, setError] = useState<string | null>(null)
  const load = () => api.project(id).then(setP).catch(e => setError(e.message))
  useEffect(() => { load() }, [id])
  useEffect(() => { if (p) document.title = `${p.name} · Planwalk` }, [p])
  // while plans are building, keep the page fresh
  const building = !!p?.uploads.some(u => u.status === 'uploaded' || u.status === 'extracting')
  useEffect(() => { if (!building) return; const t = setInterval(load, 2000); return () => clearInterval(t) }, [building, id])
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
          <div className="houses">{p.houses.map(h => <HouseCard key={h.id} house={h} canShare={can('share')} canUpdate={can('upload')} projectId={p.id} onChange={load} />)}</div>
        )}
      </section>

      {p.role === 'client' ? null : <>
      {can('edit') && <section>
        <h2>Client feedback</h2>
        <FeedbackList projectId={p.id} />
      </section>}

      {can('edit') && <section>
        <h2>Clients</h2>
        <ClientsBox projectId={p.id} hasModel={p.houses.length > 0} />
      </section>}

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
            <li key={u.id}>
              <span><b>{u.fileName}</b><small>{u.targetHouseId ? `Update of ${p.houses.find(h => h.id === u.targetHouseId)?.title ?? 'a house'} · ` : ''}{(u.sizeBytes / 1e6).toFixed(1)} MB · {new Date(u.createdAt).toLocaleDateString()}{u.status === 'failed' && u.error ? ` · ${u.error}` : ''}</small></span>
              <span className="uprow">
                <em className={`st st-${u.status}`}>{STATUS_LABEL[u.status] ?? u.status}</em>
                {(u.status === 'review' || u.status === 'ready') && can('upload') && <Link className={'btn sm' + (u.status === 'review' ? ' primary' : '')} to={`/app/review/${u.id}`}>{u.status === 'review' ? (u.targetHouseId ? 'Review and publish' : 'Review') : 'Open review'}</Link>}
                {u.status === 'failed' && can('upload') && <button className="btn sm" onClick={() => api.rebuildUpload(u.id).then(load).catch(e => setError(e.message))}>Try again</button>}
              </span>
            </li>
          ))}</ul>
        )}
      </section>
      </>}
    </main>
  )
}

// Invite the home's owners: they get a personal link, choose a password, and see only this project.
function ClientsBox({ projectId, hasModel }: { projectId: string; hasModel: boolean }) {
  const [c, setC] = useState<Clients | null>(null), [email, setEmail] = useState(''), [name, setName] = useState('')
  const [made, setMade] = useState<NewInvite | null>(null), [copied, setCopied] = useState(false), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const load = () => api.clients(projectId).then(setC).catch(e => setError(e.message))
  useEffect(() => { load() }, [projectId])
  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { setMade(await api.inviteClient(projectId, { email, name: name || undefined })); setEmail(''); setName(''); setCopied(false); load() }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(made!.link); setCopied(true) } catch { setCopied(false) } }
  const wa = made ? `https://wa.me/?text=${encodeURIComponent(`הבית שלכם מוכן לסיור בתלת-ממד:\n${made.link}`)}` : ''
  return (
    <div className="clients">
      <p className="empty">Clients walk through the home, change finishes and the kitchen, leave notes, and send it all back to you as one report. They see this project only.</p>
      {!hasModel && <p className="warnline">There is no 3D model yet. You can invite now; the client will see the home once the plans are built.</p>}
      <form className="unitform" onSubmit={invite}>
        <input aria-label="Client's email" type="email" placeholder="Client's email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={200} />
        <input aria-label="Client's name" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        <button className="btn sm primary" disabled={busy}>{busy ? 'Inviting…' : 'Invite client'}</button>
      </form>
      {made && (
        <div className="newlink" role="status">
          <p>Invitation emailed to {made.email}. You can also send the link yourself. It is shown only once and works for one person.</p>
          <div><input readOnly value={made.link} onFocus={e => e.currentTarget.select()} aria-label="Invitation link" /><button className="btn sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button><a className="btn sm" href={wa} target="_blank" rel="noreferrer">WhatsApp</a></div>
        </div>
      )}
      {error && <p className="bad" role="alert">{error}</p>}
      {c && (c.members.length > 0 || c.invites.length > 0) && (
        <ul className="rows">
          {c.members.map(m => (
            <li key={m.id}><span><b>{m.name}</b><small>{m.email} · joined {new Date(m.since).toLocaleDateString()}</small></span>
              <button className="btn sm" onClick={async () => { if (confirm(`Remove ${m.name}'s access to this project?`)) { await api.removeClient(projectId, m.id); load() } }}>Remove</button></li>
          ))}
          {c.invites.map(i => (
            <li key={i.id}><span><b>{i.name || i.email}</b><small>{i.name ? `${i.email} · ` : ''}invited {new Date(i.createdAt).toLocaleDateString()} · not joined yet</small></span>
              <button className="btn sm" onClick={async () => { await api.revokeInvite(projectId, i.id); load() }}>Cancel invite</button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

// What clients sent back: every change against your plan, in their words, with the price difference.
const KIND_LABEL: Record<string, string> = { wall: 'Walls', window: 'Windows', kitchen: 'Kitchen', finish: 'Finishes' }
function FeedbackList({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Feedback[] | null>(null), [error, setError] = useState<string | null>(null)
  const load = () => api.feedback(projectId).then(setRows).catch(e => setError(e.message))
  useEffect(() => { load() }, [projectId])
  if (error) return <p className="bad">{error}</p>
  if (!rows) return <p className="empty">Loading…</p>
  if (!rows.length) return <p className="empty">Nothing yet. When a client presses “Send to architect” in the walkthrough, their changes appear here.</p>
  const set = async (f: Feedback, status: Feedback['status']) => { await api.setFeedback(f.id, status); load() }
  return (
    <div className="fb">{rows.map(f => {
      const r = f.report, diff = r.cost.difference
      return (
        <article key={f.id} className={`fbcard fb-${f.status}`}>
          <header>
            <span><b>{f.author ?? 'Client'}</b><small>{new Date(f.createdAt).toLocaleString()} · {r.changes.length} change{r.changes.length === 1 ? '' : 's'}{r.comments ? ` · ${r.comments} open note${r.comments === 1 ? '' : 's'}` : ''}</small></span>
            <em className={`st st-fb-${f.status}`}>{f.status === 'sent' ? 'New' : f.status === 'seen' ? 'Seen' : 'Done'}</em>
          </header>
          {f.message && <blockquote dir="auto">{f.message}</blockquote>}
          {r.changes.length === 0 ? <p className="empty">No changes to the plan{r.comments ? '; see the notes in the walkthrough.' : '.'}</p> : (
            (['wall', 'window', 'kitchen', 'finish'] as const).filter(k => r.counts[k]).map(k => (
              <div key={k} className="fbgroup">
                <h3>{KIND_LABEL[k]} <small>{r.counts[k]}</small></h3>
                <ul dir="rtl">{r.changes.filter(c => c.kind === k).map((c, i) => <li key={i}><b>{c.where}</b> {c.what}{c.issue ? <small className="bad"> · {c.issue}</small> : null}</li>)}</ul>
              </div>
            ))
          )}
          <footer>
            <span className="fbcost">{diff === 0 ? 'No price difference' : <>Price difference: <b className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? '+' : '−'}₪{Math.abs(Math.round(diff)).toLocaleString('en-US')}</b></>}</span>
            {f.designId && <Link className="btn sm primary" to={`/h/${f.houseId}?design=${f.designId}`}>See it in 3D</Link>}
            {f.status === 'sent' && <button className="btn sm" onClick={() => set(f, 'seen')}>Mark as seen</button>}
            {f.status !== 'done' && <button className="btn sm" onClick={() => set(f, 'done')}>Done</button>}
          </footer>
        </article>
      )
    })}</div>
  )
}

function HouseCard({ house, canShare, canUpdate, projectId, onChange }: { house: HouseRow; canShare: boolean; canUpdate: boolean; projectId: string; onChange: () => void }) {
  const [upBusy, setUpBusy] = useState(false), [upMsg, setUpMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const update = async (file?: File) => {
    if (!file) return
    setUpBusy(true); setUpMsg(null)
    try { await api.uploadPlans(projectId, file, house.id); setUpMsg({ ok: true, text: `${file.name} uploaded. It is being built as the next version; review it under Plans. Clients keep seeing the current version until you publish.` }); onChange() }
    catch (e) { setUpMsg({ ok: false, text: (e as Error).message }) } finally { setUpBusy(false) }
  }
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
        <span><b>{house.title}</b><small>{house.version ? `Version ${house.version} · ` : 'Not approved yet · '}{house.public ? 'Public demo' : 'Private · members, clients and share links only'}</small></span>
        <Link className="btn sm primary" to={`/h/${house.id}`}>Open walkthrough</Link>
        {canUpdate && !!house.version && <label className={'btn sm filebtn' + (upBusy ? ' busy' : '')}>{upBusy ? 'Uploading…' : 'Upload updated plans'}<input type="file" accept="application/pdf" disabled={upBusy} onChange={e => { update(e.target.files?.[0]); e.target.value = '' }} /></label>}
        {canShare && <button className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>Share</button>}
      </div>
      {upMsg && <p className={upMsg.ok ? 'ok' : 'bad'} role="status">{upMsg.text}</p>}
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
