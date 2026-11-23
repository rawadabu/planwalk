// Photoreal gallery of a house: export it from the viewer as GLB, render one image per room with Blender, and write
// the images + renders.json next to house.json.
//   node tools/blender/gallery.mjs <houseId> [samples] [width]
// needs: the viewer running (PLANWALK_URL, default the demo on :5173), storage/houses/<id>/views.json (from the pipeline),
// and Python with bpy (PLANWALK_PYTHON, default python3).
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(import.meta.url)('playwright')        // npm i -D playwright && npx playwright install chromium
const [, , id, samples = '64', width = '1280'] = process.argv
if (!id) { console.error('usage: node tools/blender/gallery.mjs <houseId> [samples] [width]'); process.exit(1) }
const dir = path.resolve(here, '../../storage/houses', id)
const viewsPath = path.join(dir, 'views.json')
if (!existsSync(viewsPath)) { console.error(`no ${viewsPath}: build the house with the pipeline first`); process.exit(1) }
const base = process.env.PLANWALK_URL ?? 'http://127.0.0.1:5173'

// 1. the model, exactly as the viewer builds it
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '', contentType: 'text/css' }))
await page.goto(`${base}/?test#/h/${id}?test`)
await page.waitForFunction(() => !!window.__viewer && !!document.querySelector('.roomcard'), null, { timeout: 240000 })
await page.waitForTimeout(2500)
const b64 = await page.evaluate(async () => { const u = new Uint8Array(await window.__viewer.exportGLB()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s) })
await browser.close()
const glb = path.join(mkdtempSync(path.join(tmpdir(), 'planwalk-')), 'house.glb')
writeFileSync(glb, Buffer.from(b64, 'base64'))
console.log(`exported ${(Buffer.byteLength(b64, 'base64') / 1e6).toFixed(1)} MB`)

// 2. render every view
const views = JSON.parse(readFileSync(viewsPath, 'utf8'))
const done = []
const save = () => writeFileSync(path.join(dir, 'renders.json'), JSON.stringify(done, null, 1))
await new Promise((resolve, reject) => {
  const py = spawn(process.env.PLANWALK_PYTHON ?? 'python3', [path.join(here, 'render.py'), glb, viewsPath, dir, samples, width], { stdio: ['ignore', 'pipe', 'inherit'] })
  let buf = ''
  py.stdout.on('data', d => {
    buf += d
    for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
      const m = /^rendered (\S+) (\d+) s/.exec(buf.slice(0, i)); if (!m) continue
      const v = views.find(v => v.id === m[1]); if (!v) continue
      done.push({ id: v.id, name: v.name, storey: v.storey, file: `render_${v.id}.jpg`, seconds: Number(m[2]) }); save()   // the gallery fills in as images arrive
      console.log(`${done.length}/${views.length} ${v.name} (${m[2]} s)`)
    }
  })
  py.on('exit', code => (code === 0 ? resolve() : reject(new Error(`render.py exited ${code}`))))
})
console.log(`gallery: ${done.length} images in ${dir}`)
