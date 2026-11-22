import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { signIn, signUp } from '../lib/auth'
import '../styles/landing.css'
import '../styles/app.css'

// Sign in / create account (email + password, Better Auth).
export default function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const nav = useNavigate(), [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/app'
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    const res = mode === 'signup' ? await signUp.email({ name, email, password }) : await signIn.email({ email, password })
    setBusy(false)
    if (res.error) setError(res.error.message ?? 'Something went wrong. Try again.')
    else nav(next, { replace: true })
  }
  return (
    <main className="auth">
      <Link className="logo" to="/">Planwalk</Link>
      <form className="card" onSubmit={submit}>
        <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
        {mode === 'signup' && <><label htmlFor="name">Full name</label><input id="name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} /></>}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        <label htmlFor="password">Password {mode === 'signup' && <small>(at least 10 characters)</small>}</label>
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 10 : undefined} required />
        {error && <p className="bad" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        <p className="alt">{mode === 'signup'
          ? <>Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>
          : <>New to Planwalk? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></>}</p>
      </form>
    </main>
  )
}
