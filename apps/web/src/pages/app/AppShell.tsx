import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { api, ApiError, type Me } from '../../api'
import { authClient, signOut } from '../../lib/auth'
import '../../styles/landing.css'
import '../../styles/app.css'

interface Ctx { me: Me; orgId: string; role: string; reload: () => Promise<void> }
const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('useApp outside AppShell'); return c }

const KINDS = [['developer', 'Developer / real-estate marketing'], ['architect', 'Architecture or interior studio'], ['private', 'Private home owner']] as const

// Signed-in area: loads /api/me, redirects to /login when signed out, asks for an organization on first visit.
export default function AppShell() {
  const nav = useNavigate(), loc = useLocation()
  const [me, setMe] = useState<Me | null>(null)
  const load = useCallback(async () => {
    try { setMe(await api.me()) }
    catch (e) { if (e instanceof ApiError && e.status === 401) nav(`/login?next=${encodeURIComponent(loc.pathname)}`, { replace: true }) }
  }, [nav, loc.pathname])
  useEffect(() => { load() }, [load])
  if (!me) return <main className="wrap app-loading">Loading…</main>

  const org = me.organizations.find(o => o.id === me.activeOrganizationId) ?? me.organizations[0]
  const switchOrg = async (id: string) => { await authClient.organization.setActive({ organizationId: id }); await load(); nav('/app') }
  return (
    <>
      <nav><div className="wrap">
        <Link className="logo" to="/app">Planwalk</Link>
        {me.organizations.length > 1 && (
          <select className="orgsel" aria-label="Organization" value={org?.id} onChange={e => switchOrg(e.target.value)}>
            {me.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <div className="links"><Link to="/app">Projects</Link><Link to="/app/prices">Price book</Link><Link to="/">Website</Link></div>
        <span className="who">{me.user.name}</span>
        <button className="btn sm" onClick={async () => { await signOut(); nav('/') }}>Sign out</button>
      </div></nav>
      {org ? (
        <AppCtx.Provider value={{ me, orgId: org.id, role: org.role, reload: load }}>
          <Outlet />
        </AppCtx.Provider>
      ) : <Onboarding onDone={load} />}
    </>
  )
}

function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState(''), [kind, setKind] = useState<string>('developer'), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org'
    const res = await authClient.organization.create({ name, slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`, metadata: { kind } })
    if (res.error) { setError(res.error.message ?? 'Could not create the organization'); setBusy(false); return }
    await authClient.organization.setActive({ organizationId: res.data!.id })
    await onDone()
  }
  return (
    <main className="wrap narrow">
      <form className="card" onSubmit={submit}>
        <div className="eyebrow">Welcome</div>
        <h1>Set up your workspace</h1>
        <label htmlFor="oname">Company or studio name</label>
        <input id="oname" value={name} onChange={e => setName(e.target.value)} required maxLength={80} placeholder="e.g. Acme Developers" />
        <fieldset><legend>Who is it for?</legend>
          {KINDS.map(([v, label]) => <label key={v} className="radio"><input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} /> {label}</label>)}
        </fieldset>
        {error && <p className="bad" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
      </form>
    </main>
  )
}
