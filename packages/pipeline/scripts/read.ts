// Read every label on a plan with the Claude API and save the result.
// Usage: ANTHROPIC_API_KEY=... npx tsx scripts/read.ts plan.pdf outdir
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { readLayers } from '../src/pdf'
import { allLabels } from '../src/labels'
import { readLabels, asCm } from '../src/read'
const [, , file, out] = process.argv
if (!file || !out) { console.error('usage: tsx scripts/read.ts plan.pdf outdir'); process.exit(1) }
mkdirSync(out, { recursive: true })
const L = await readLayers(new Uint8Array(readFileSync(file)))
const { text: T, dims: D } = allLabels(L)
const all = [...T, ...D]
console.log(`reading ${T.length} text labels and ${D.length} dimensions…`)
const got = await readLabels(all, { onBatch: (done, total) => console.log(`  ${done}/${total}`) })
const rows = all.map(l => ({ id: l.id, layerKind: l.kind, box: l.box.map(v => +v.toFixed(1)), dir: l.dir, ...(got.get(l.id) ?? { text: '', kind: 'note', mirrored: false, storey: null, scale: null }) }))
writeFileSync(`${out}/readings.json`, JSON.stringify(rows, null, 1))
const by = (k: string) => rows.filter(r => r.kind === k)
console.log('titles:', by('title').map(r => `${r.text} → storey ${r.storey}, 1:${r.scale}`))
console.log('rooms:', [...new Set(by('room').map(r => r.text))].join(' · '))
console.log('fixtures:', [...new Set(by('fixture').map(r => r.text))].join(' · '))
const dims = rows.filter(r => r.layerKind === 'dim')
console.log(`dimensions: ${dims.filter(r => asCm(r.text) !== null).length}/${dims.length} read as numbers; unread text labels: ${rows.filter(r => r.layerKind === 'text' && !r.text).length}`)
