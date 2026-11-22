import { Link } from 'react-router'
export default function NotFound() {
  return <main className="wrap" style={{ paddingBlock: 80 }}><h1>Page not found</h1><p style={{ marginTop: 12 }}><Link to="/">Back to Planwalk</Link></p></main>
}
