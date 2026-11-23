// six cube faces from one standing point: node pano.js <houseId> <floor> <x> <y> <outPrefix>
const { chromium } = require('playwright')
const [ID, LIST, OUTDIR] = process.argv.slice(2)
const JOBS = JSON.parse(require('fs').readFileSync(LIST, 'utf8')).points.filter(j => !require('fs').existsSync(`${OUTDIR}/${j.id}_d.png`) && j.room !== 'סלון').filter((j, i) => { const [k, n] = (process.argv[5] || '0/1').split('/').map(Number); return i % n === k })
;(async () => {
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  for (const J of JOBS) {
  const p = await (await br.newContext({ viewport: { width: 1024, height: 1024 } })).newPage()
  p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 200)))
  const render = async () => { for (let i = 0; i < 2; i++) { await p.evaluate(() => { window.__twRendered = 0; window.__viewer.requestRender() }); await p.waitForFunction(() => window.__twRendered > 0, null, { timeout: 900000 }).catch(() => {}) } }
  await p.goto(`http://127.0.0.1:5173/?test&bare#/h/${ID}`); await p.waitForSelector('.bar', { timeout: 180000 }); await p.waitForTimeout(1500)
  await p.evaluate(() => document.querySelector('.bar button')?.blur())
  await p.evaluate(([f, x, y]) => { window.__viewer.goTo(f, x, y, 0); window.__viewer.setTime?.('noon') }, [J.floor, J.x, J.y])
  await p.waitForTimeout(600); await p.waitForFunction(() => !window.__exp.camera.tween && !window.__exp.player.climb && window.__exp.state.mode === 'walk', null, { timeout: 900000 })
  await render()
  await p.addStyleTag({ content: '#root * { visibility: hidden !important } #root canvas { visibility: visible !important }' })
  const faces = { n: [[0, 0, -1], [0, 1, 0]], e: [[1, 0, 0], [0, 1, 0]], s: [[0, 0, 1], [0, 1, 0]], w: [[-1, 0, 0], [0, 1, 0]], u: [[0, 1, 0], [0, 0, 1]], d: [[0, -1, 0], [0, 0, -1]] }
  for (const [name, [f, up]] of Object.entries(faces)) {
    await p.evaluate(([f, up]) => {
      const exp = window.__exp, cam = exp.camera.instance
      exp.state.mode = 'top'; exp.camera.orbit.enabled = false           // nobody drives the camera but us (no event: the house stays as walked)
      cam.fov = 90; cam.aspect = 1; cam.near = .05; cam.updateProjectionMatrix()
      cam.up.set(up[0], up[1], up[2]); cam.lookAt(cam.position.x + f[0], cam.position.y + f[1], cam.position.z + f[2])
    }, [f, up])
    await render()
    await p.locator('canvas').first().screenshot({ path: `${OUTDIR}/${J.id}_${name}.png` })
  }
  console.log('faces done', J.id, await p.evaluate(() => JSON.stringify(window.__exp.camera.instance.position)))
  await p.close()
  }
  await br.close()
})().catch(e => { console.error('FAIL', e.message.slice(0, 400)); process.exit(1) })
