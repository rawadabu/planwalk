import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import ViewerPage from './ViewerPage'
import '../styles/landing.css'

// Public entry for share links (/s/:token): resolve the token, then open the walkthrough with it.
export default function SharePage() {
  const { token = '' } = useParams()
  const [house, setHouse] = useState<string | null>(null), [error, setError] = useState<string | null>(null)
  useEffect(() => { api.resolveShare(token).then(r => setHouse(r.houseId)).catch(e => setError(e.message)) }, [token])
  if (error) return <main className="wrap" style={{ paddingBlock: 80 }}><h1>This link doesn't work anymore</h1><p style={{ marginTop: 12 }}>{error}. Ask whoever sent it for a new one.</p><p style={{ marginTop: 20 }}><Link to="/">Planwalk</Link></p></main>
  if (!house) return null
  return <ViewerPage houseIdOverride={house} share={token} />
}
