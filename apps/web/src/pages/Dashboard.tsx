import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type ProjectDto, type HouseSummary } from '../api'
import '../styles/landing.css'
import '../styles/dashboard.css'

const STATUS: Record<ProjectDto['status'], string> = {
  uploaded: 'Uploaded · waiting for processing', extracting: 'Reading walls from the plans', review: 'Needs review',
  furnishing: 'Furnishing', ready: 'Ready to share', failed: 'Failed',
}

// Customer area: upload plans (creates a project) and open the houses that are ready.
export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [houses, setHouses] = useState<HouseSummary[]>([])
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const load = () => { api.projects().then(setProjects).catch(() => {}); api.houses().then(setHouses).catch(() => {}) }
  useEffect(() => { document.title = 'Projects · Planwalk'; load() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setMsg({ ok: false, text: 'Choose the PDF of the plans.' }); return }
    setBusy(true); setMsg(null)
    try {
      const p = await api.createProject(name, file)
      setMsg({ ok: true, text: `“${p.name}” uploaded. We'll start reading the plans.` })
      setName(''); setFile(null); (e.target as HTMLFormElement).reset(); load()
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <nav><div className="wrap">
        <Link className="logo" to="/">Planwalk</Link>
        <div className="links"><Link to="/">Home</Link></div>
      </div></nav>
      <main className="wrap dash">
        <header><div className="eyebrow">Your projects</div><h1>Projects</h1></header>

        <form className="upload" onSubmit={submit}>
          <h2>New home</h2>
          <label htmlFor="pname">Project name</label>
          <input id="pname" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Herzliya, building B, unit 14" maxLength={120} required />
          <label htmlFor="pfile">Architect's plans (PDF, up to 50 MB)</label>
          <input id="pfile" type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} required />
          <button className="btn primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload plans'}</button>
          {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
        </form>

        <section className="list">
          <h2>Ready to walk</h2>
          {houses.length === 0 ? <p className="empty">No homes are ready yet.</p> : (
            <ul>{houses.map(h => <li key={h.id}><span>{h.title}</span><Link className="btn sm primary" to={`/h/${h.id}`}>Open walkthrough</Link></li>)}</ul>
          )}
          <h2>In progress</h2>
          {projects.length === 0 ? <p className="empty">Upload the plans of a home to start your first project.</p> : (
            <ul>{projects.map(p => <li key={p.id}><span><b>{p.name}</b><small>{p.sourceFile} · {new Date(p.createdAt).toLocaleDateString()}</small></span><em className={`st st-${p.status}`}>{STATUS[p.status]}</em></li>)}</ul>
          )}
        </section>
      </main>
    </>
  )
}
