import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type ProjectKind, type ProjectRow } from '../../api'
import { useApp } from './AppShell'

const canCreate = (role: string) => ['owner', 'admin', 'architect'].includes(role)

export default function Projects() {
  const { orgId, role, me } = useApp()
  const [rows, setRows] = useState<ProjectRow[] | null>(null)
  const [name, setName] = useState(''), [kind, setKind] = useState<ProjectKind>('development'), [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const load = () => api.projects(orgId).then(setRows).catch(e => setError(e.message))
  useEffect(() => { document.title = 'Projects · Planwalk'; load() }, [orgId])
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { await api.createProject({ organizationId: orgId, name, kind, address: address || undefined }); setName(''); setAddress(''); await load() }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const orgName = me.organizations.find(o => o.id === orgId)?.name
  return (
    <main className="wrap dash">
      <header><div className="eyebrow">{orgName} · {role}</div><h1>Projects</h1></header>
      {canCreate(role) && (
        <form className="upload" onSubmit={create}>
          <h2>New project</h2>
          <label htmlFor="pn">Project name</label>
          <input id="pn" value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder="e.g. Herzliya Towers, building B" />
          <label htmlFor="pk">Type</label>
          <select id="pk" value={kind} onChange={e => setKind(e.target.value as ProjectKind)}><option value="development">Development (many units)</option><option value="private">Private home</option></select>
          <label htmlFor="pa">Address <small>(optional, used for real sun angles)</small></label>
          <input id="pa" value={address} onChange={e => setAddress(e.target.value)} maxLength={200} />
          {error && <p className="bad" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        </form>
      )}
      <section className="list">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? (
          <p className="empty">{canCreate(role) ? 'No projects yet. Create the first one to upload plans.' : 'No projects have been shared with you yet.'}</p>
        ) : (
          <ul>{rows.map(p => (
            <li key={p.id}>
              <span><b>{p.name}</b><small>{p.kind === 'development' ? 'Development' : 'Private home'}{p.address ? ` · ${p.address}` : ''} · {p.units} units · {p.houses} 3D models</small></span>
              <Link className="btn sm" to={`/app/p/${p.id}`}>Open</Link>
            </li>
          ))}</ul>
        )}
      </section>
    </main>
  )
}
