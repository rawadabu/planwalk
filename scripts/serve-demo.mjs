// Serves the static demo (apps/web/dist-demo) on http://localhost:5173 — no database, no install needed.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../apps/web/dist-demo')
const storage = path.resolve(here, '../storage')   // library/ and houses/ come from here (not copied into the demo)
const port = Number(process.env.PORT || 5173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const base = /^\/(library|houses)\//.test(p) ? storage : root
  const file = path.join(base, p === '/' ? 'index.html' : p)
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // the static demo routes with #: /h/twin-a → /#/h/twin-a (page addresses only, not missing files)
    if (!path.extname(p) && !/^\/(library|houses|assets|img)\//.test(p)) { res.writeHead(302, { location: '/#' + p }); return res.end() }
    res.writeHead(404); return res.end('Not found')
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(port, () => console.log(`Planwalk demo: http://localhost:${port}`))
