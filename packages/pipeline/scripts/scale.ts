import { readFileSync } from 'node:fs'
import { readLayers } from '../src/pdf'
import { allLabels } from '../src/labels'
import { calibrate } from '../src/scale'
import { asCm } from '../src/read'
const [, , file, readings] = process.argv
const L = await readLayers(new Uint8Array(readFileSync(file)))
const D = allLabels(L)
const R = new Map<number, any>(JSON.parse(readFileSync(readings, 'utf8')).map((r: any) => [r.id, r]))
const sc = calibrate(D.lines, D.ticks, D.dims, l => asCm(R.get(l.id)?.text))
console.log(sc && { ptPerCm: sc.ptPerCm, ptPerM: sc.ptPerCm * 100, pxPerPt: 0.9931818 / sc.ptPerCm, used: sc.used, agree: sc.agree, spread: sc.spread })
console.log('disagree:', sc?.measured.filter(m => !m.ok).map(m => `${R.get(m.id)?.text}cm→${(m.pt / sc.ptPerCm).toFixed(0)}`).join(' '))
