import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { renderLabel, type Label } from './labels'

/**
 * Reading: the picture of each label → its text and what kind of thing it names. Positions never come from the model
 * (they are the vectors' own); the model only reads and classifies, so a wrong answer is a wrong word, not a moved wall.
 */
const MODEL = 'claude-opus-5-5'
const BATCH = 80                    // labels per request (one small image each)

const Reading = z.object({
  labels: z.array(z.object({
    id: z.number().int(),
    text: z.string(),               // '' when unreadable
    mirrored: z.boolean(),          // drawn as a mirror image (the mirrored half of a twin house)
    kind: z.enum(['room', 'fixture', 'title', 'dimension', 'note']),
    storey: z.number().int().nullable(),      // titles: 0 ground, 1 first, 2 second, -1 basement …
    scale: z.number().nullable(),             // titles: 100 for 1:100
  })),
})
export type Read = z.infer<typeof Reading>['labels'][number]

const SYSTEM = `You read labels cropped from an Israeli architect's floor plan (a CAD drawing). Each image is one label, turned upright, drawn in a single-stroke CAD font. Most are Hebrew; dimensions are plain numbers in centimetres.

For each numbered image return:
- text: exactly what is written, in normal reading order. Keep abbreviations as written (ממ"ד, פ"ישיבה, ח"שינה). If the label is drawn as a mirror image, read it as it would read un-mirrored and set mirrored to true. If it cannot be read, return an empty string; never guess a plausible word.
- kind: "room" for the name of a space (סלון, מטבח, ממ"ד, מרפסת, חדר שינה, שירותים, מבואה…); "fixture" for furniture, appliances and built-ins (מקרר, כיור, 3 מגירות, ארון חשמל, קמין…); "title" for a drawing title (it names a storey and usually a scale); "dimension" for a number that is a measurement; "note" for anything else.
- storey: for a title, the storey it names as a number (קרקע 0, ראשונה 1, שנייה 2, מרתף -1, גג the top storey + 1); otherwise null.
- scale: for a title that states a scale (קנ"מ 1:100), the denominator (100); otherwise null.`

export interface ReadOptions { client?: Anthropic; onBatch?: (done: number, total: number) => void }

/** Fill in `text` on every label and return the full readings keyed by label id. Labels are sent in batches. */
export async function readLabels(labels: Label[], opts: ReadOptions = {}): Promise<Map<number, Read>> {
  const client = opts.client ?? new Anthropic()
  const out = new Map<number, Read>()
  for (let at = 0; at < labels.length; at += BATCH) {
    const batch = labels.slice(at, at + BATCH)
    const content: Anthropic.Beta.BetaContentBlockParam[] = []
    for (const l of batch) {
      content.push({ type: 'text', text: `#${l.id}` })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: renderLabel(l).toString('base64') } })
    }
    content.push({ type: 'text', text: `Read these ${batch.length} labels. Return one entry per number.` })
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',         // a declined request is re-run on a fallback model inside the same call
      output_config: { effort: 'low', format: betaZodOutputFormat(Reading) },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    })
    if (res.stop_reason === 'refusal') throw new Error(`reading declined (${res.stop_details?.category ?? 'no category'})`)
    if (res.stop_reason === 'max_tokens' || !res.parsed_output) throw new Error('reading was cut short; lower BATCH')
    const ids = new Set(batch.map(l => l.id))
    for (const r of res.parsed_output.labels) if (ids.has(r.id)) out.set(r.id, r)
    opts.onBatch?.(Math.min(at + BATCH, labels.length), labels.length)
  }
  for (const l of labels) { const r = out.get(l.id); if (r?.text) l.text = r.text }
  return out
}

/** A dimension reading as centimetres, or null when it isn't a clean number. */
export const asCm = (text: string | undefined): number | null => (text && /^\d{1,4}(\.\d+)?$/.test(text.trim()) ? Number(text) : null)
