import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { authClient, useSession } from '../lib/auth'
import '../styles/landing.css'
import '../styles/app.css'

// Landing page of an invitation email: sign in (or create an account), then accept.
export default function InvitePage() {
  const { id = '' } = useParams(), nav = useNavigate()
  const { data: session, isPending } = useSession()
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { document.title = 'Invitation · Planwalk' }, [])
  if (isPending) return <main className="auth"><p>Loading…</p></main>
  const next = `/invite/${id}`
  if (!session) return (
    <main className="auth"><div className="card">
      <h1>You've been invited to Planwalk</h1>
      <p>Sign in or create an account with the email address the invitation was sent to.</p>
      <Link className="btn primary" to={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link>
      <Link className="btn" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
    </div></main>
  )
  const accept = async () => {
    setBusy(true); setError(null)
    const res = await authClient.organization.acceptInvitation({ invitationId: id })
    setBusy(false)
    if (res.error) setError(res.error.code === 'EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION'
      ? `Confirm your email first: we sent a link to ${session.user.email}. Then come back to this page.` : res.error.message ?? 'Could not accept the invitation')
    else { if (res.data?.member?.organizationId) await authClient.organization.setActive({ organizationId: res.data.member.organizationId }); nav('/app') }
  }
  return (
    <main className="auth"><div className="card">
      <h1>Join the team</h1>
      <p>Signed in as {session.user.email}.</p>
      {error && <p className="bad" role="alert">{error}</p>}
      <button className="btn primary" onClick={accept} disabled={busy}>{busy ? 'Joining…' : 'Accept invitation'}</button>
    </div></main>
  )
}
