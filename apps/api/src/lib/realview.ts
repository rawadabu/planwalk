import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PARTS, finish, resolveFinish, type Design, type Part } from '@planwalk/design'
import { config } from '../config.js'

const run = promisify(execFile)

/**
 * Photoreal views. The viewer's own frame (exact walls, the client's furniture and finishes) is sent to an image model
 * with instructions to keep everything where it is and only make it look real. The words are ours, never the
 * caller's: the request names a room and a design, and the prompt is built here.
 */
const ROOMS: Array<[RegExp, string]> = [
  [/סלון|מגורים/, 'living room'], [/ישיבה|משפחה/, 'family sitting area'], [/מטבח/, 'kitchen'], [/שינה.*ילד|ילדים/, "children's bedroom"], [/שינה/, 'bedroom'],
  [/מקלחת|אמבט|רחצה/, 'bathroom'], [/שירותים/, 'guest toilet'], [/כניסה|מבוא/, 'entrance hall'], [/ארונות/, 'walk-in wardrobe'], [/כביסה/, 'laundry room'], [/מרפסת/, 'balcony'], [/ממ"ד|ממ״ד|עבודה/, 'study'],
]
export function promptFor(room: string | null, scene: 'interior' | 'exterior', design: Design | null): string {
  const en = (part: Part) => { const id = design ? resolveFinish(design, part, {}).id : null; return id ? finish(id)?.en.toLowerCase() : null }
  if (scene === 'exterior') return [
    'Turn this real-time 3D model screenshot of a modern house and its garden into a photorealistic architectural exterior photograph in warm late-afternoon light.',
    'Keep the building exactly as it is: the same camera position and angle, the same volumes, walls, roof line, balconies, railings, windows and doors in the same places and proportions, and every tree, plant and piece of garden furniture where it stands. Do not add, remove or move any part of the building; no people, no text.',
    'Only improve realism: smooth white plaster with fine texture, a natural stone base, slim dark aluminium window frames with real glass reflections, a healthy lawn, real foliage, soft realistic shadows, a clear sky.',
  ].join(' ')
  const kind = ROOMS.find(([re]) => re.test(room ?? ''))?.[1] ?? 'room of a family home'
  const materials = [en('floor') && `${en('floor')} flooring`, en('walls') && `${en('walls')} matt walls`, en('joinery') && `${en('joinery')} joinery`, en('worktop') && `${en('worktop')} worktops`, en('frames') && `${en('frames')} window frames`].filter(Boolean)
  return [
    `Turn this real-time 3D model screenshot of a ${kind} into a photorealistic architectural interior photograph, as shot by a professional interiors photographer in warm natural light.`,
    'Keep the room exactly as it is: the same camera position and angle, the same walls, ceiling, openings, stairs and railings, and every piece of furniture, lamp, rug, plant and fitting in the same position, size and shape. Do not add, remove or move anything: no extra rugs, plants, pictures or objects; no people, no text.',
    `Only improve realism: ${materials.length ? materials.join(', ') + ', ' : ''}real fabric weave on the upholstery and on any rug that is already there, clear glass in slim frames, soft realistic shadows and gentle bounce light, discreet recessed ceiling spotlights. Surfaces that are plain and smooth stay plain and smooth.`,
    'Through the windows keep what is there: the balcony or garden, and beyond it a quiet residential street with trees.',
    'High-end residential, calm and lived-in, sharp detail.',
  ].join(' ')
}
void PARTS

/** The closest aspect ratio the image model offers for a frame of this size. */
export function ratioFor(width: number, height: number): string {
  const all: Array<[string, number]> = [['21:9', 21 / 9], ['16:9', 16 / 9], ['3:2', 1.5], ['4:3', 4 / 3], ['1:1', 1], ['3:4', .75], ['2:3', 2 / 3], ['9:16', 9 / 16]]
  const r = width / Math.max(1, height)
  return all.sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0]
}

let cli: Promise<boolean> | null = null
/** Can pictures be made on this server right now? */
export function available(): Promise<boolean> {
  if (config.realview.provider !== 'higgsfield-cli') return Promise.resolve(false)
  return (cli ??= run('higgsfield', ['version'], { timeout: 15_000 }).then(() => true, () => false))
}

// one picture at a time: the image service refuses parallel jobs on a small balance
let queue: Promise<unknown> = Promise.resolve()
/** Send a frame (a local image file) through the image model; returns the picture as bytes. */
export function generate(file: string, prompt: string, ratio: string): Promise<Buffer> {
  const job = queue.then(async () => {
    const { stdout } = await run('higgsfield', ['generate', 'create', config.realview.model, '--prompt', prompt, '--image', file, '--aspect_ratio', ratio, '--wait', '--wait-timeout', '8m', '--json'], { timeout: 9 * 60_000, maxBuffer: 8 * 1024 * 1024 })
    const parsed = JSON.parse(stdout) as unknown, j = (Array.isArray(parsed) ? parsed[0] : parsed) as { status?: string; result_url?: string } | undefined
    if (!j || j.status !== 'completed' || !j.result_url) throw new Error(`the image service answered "${j?.status ?? 'nothing'}"`)
    if (!/^https:\/\/[a-z0-9.-]+\.cloudfront\.net\//.test(j.result_url)) throw new Error('the image service returned an unexpected address')
    return download(j.result_url)
  })
  queue = job.catch(() => {})
  return job
}

/** Fetch a finished picture. Where outbound traffic must go through a proxy that Node's fetch ignores, curl (which honours it) is used instead. */
export async function download(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`the picture could not be downloaded (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    try { return (await run('curl', ['-sS', '-f', '-L', '--max-time', '120', url], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 130_000 })).stdout }
    catch { throw e instanceof Error ? e : new Error(String(e)) }
  }
}

/** A screen-sized JPEG of a picture (the model returns a multi-megabyte PNG). Falls back to the original bytes. */
export async function toJpeg(image: Buffer, max = 2200): Promise<{ data: Buffer; ext: 'jpg' | 'png' }> {
  try {
    const { createCanvas, loadImage } = await import('@napi-rs/canvas')
    const img = await loadImage(image), k = Math.min(1, max / Math.max(img.width, img.height))
    const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return { data: c.toBuffer('image/jpeg', 88), ext: 'jpg' }
  } catch { return { data: image, ext: 'png' } }
}
