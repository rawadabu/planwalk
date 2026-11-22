import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projects } from '../lib/projects.js'
import { config } from '../config.js'

export async function projectRoutes(app: FastifyInstance) {
  app.get('/api/projects', async () => projects.list())

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    if (!/^[a-f0-9]{8}$/.test(req.params.id)) return reply.code(400).send({ error: 'bad id' })
    try { return await projects.get(req.params.id) } catch { return reply.code(404).send({ error: 'not found' }) }
  })

  // Upload the architect's plans (PDF). Multipart fields: name, file.
  app.post('/api/projects', async (req, reply) => {
    const parts = req.parts({ limits: { fileSize: config.maxUploadBytes, files: 1 } })
    let name = '', pdf: Buffer | null = null, fileName = 'plans.pdf'
    for await (const part of parts) {
      if (part.type === 'file') {
        pdf = await part.toBuffer()
        fileName = part.filename.replace(/[^\w.\- ]/g, '_').slice(0, 120)
      } else if (part.fieldname === 'name') name = String(part.value)
    }
    const parsed = z.string().trim().min(1).max(120).safeParse(name)
    if (!parsed.success) return reply.code(400).send({ error: 'Give the project a name' })
    if (!pdf || pdf.subarray(0, 5).toString() !== '%PDF-') return reply.code(400).send({ error: 'Upload the plans as a PDF file' })
    const p = await projects.create(parsed.data, pdf, fileName)
    return reply.code(201).send(p)
  })
}
