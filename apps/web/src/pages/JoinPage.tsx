import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, type JoinInfo } from '../api'
import { signUp, useSession } from '../lib/auth'
import '../styles/landing.css'
import '../styles/app.css'

// Where a client lands from the architect's link: choose a password (or sign in) and walk into the home.
export default function JoinPage() {
  const { token = '' } = useParams(), nav = useNavigate()
  const { data: session, isPending } = useSession()
  const [info, setInfo] = useState<JoinInfo | null>(null), [gone, setGone] = useState(false)
  const [name, setName] = useState(''), [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { document.title = 'הזמנה לבית שלך · Planwalk' }, [])
  useEffect(() => { api.joinInfo(token).then(i => { setInfo(i); setName(i.name ?? '') }).catch(() => setGone(true)) }, [token])

  const enter = async () => {
    const r = await api.join(token)
    nav(r.houseId ? `/h/${r.houseId}` : '/app', { replace: true })
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!info) return
    setBusy(true); setError(null)
    const res = await signUp.email({ name: name.trim(), email: info.email, password })
    if (res.error) { setBusy(false); setError(/exist/i.test(res.error.message ?? '') ? 'כבר יש חשבון עם כתובת המייל הזו. אפשר להיכנס איתו למטה.' : res.error.message ?? 'משהו השתבש. נסו שוב.'); return }
    try { await enter() } catch (err) { setBusy(false); setError((err as Error).message) }
  }
  const accept = async () => { setBusy(true); setError(null); try { await enter() } catch (err) { setBusy(false); setError((err as Error).message) } }

  if (gone) return <main className="auth" dir="rtl"><div className="card"><h1>ההזמנה כבר לא בתוקף</h1><p>ייתכן שכבר השתמשתם בה, או שעבר זמן רב. בקשו מהאדריכל קישור חדש, או <Link to="/login">היכנסו לחשבון</Link> אם כבר יש לכם.</p></div></main>
  if (!info || isPending) return <main className="auth" dir="rtl"><p>טוען…</p></main>
  const next = encodeURIComponent(`/join/${token}`)
  return (
    <main className="auth" dir="rtl">
      <Link className="logo" to="/">Planwalk</Link>
      {session ? (
        <div className="card">
          <div className="eyebrow">{info.studio}</div>
          <h1>{info.project}</h1>
          <p>{info.invitedBy ?? 'האדריכל'} הכין/ה עבורכם את הבית בתלת-ממד. מחוברים כ-{session.user.email}.</p>
          {error && <p className="bad" role="alert">{error}</p>}
          <button className="btn primary" onClick={accept} disabled={busy}>{busy ? 'רגע…' : 'כניסה לבית'}</button>
        </div>
      ) : (
        <form className="card" onSubmit={create}>
          <div className="eyebrow">{info.studio}</div>
          <h1>{info.project}</h1>
          <p>{info.invitedBy ?? 'האדריכל'} הכין/ה עבורכם את הבית בתלת-ממד. בחרו סיסמה, ותוכלו להסתובב בו, לשנות חומרים ולהשאיר הערות, מכל מכשיר.</p>
          <label htmlFor="jn">שם מלא</label>
          <input id="jn" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} />
          <label htmlFor="je">אימייל</label>
          <input id="je" type="email" value={info.email} readOnly dir="ltr" autoComplete="username" />
          <label htmlFor="jp">סיסמה <small>(לפחות 10 תווים)</small></label>
          <input id="jp" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required dir="ltr" />
          {error && <p className="bad" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'רגע…' : 'כניסה לבית'}</button>
          <p className="alt">כבר יש לכם חשבון? <Link to={`/login?next=${next}`}>כניסה</Link></p>
        </form>
      )}
    </main>
  )
}
