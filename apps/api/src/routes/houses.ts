import type { FastifyInstance } from 'fastify'
import { parseHouse } from '@planwalk/house'
import { storage } from '../lib/storage.js'

const ID = /^[a-z0-9-]{1,64}$/
const FILE = /^[a-z0-9_.-]{1,64}\.(png|jpg|webp)$/i

export async function houseRoutes(app: FastifyInstance) {
  // List houses that have a viewer-ready house.json
  app.get('/api/houses', async () => {
    const ids = await storage.list('houses')
    const out = []
    for (const id of ids) {
      try { const h = parseHouse(JSON.parse((await storage.read(`houses/${id}/house.json`)).toString())); out.push({ id: h.id, title: h.title }) } catch { /* skip invalid */ }
    }
    return out
  })
  // The house data (validated against the shared schema before it is served)
  app.get<{ Params: { id: string } }>('/api/houses/:id/house.json', async (req, reply) => {
    if (!ID.test(req.params.id)) return reply.code(400).send({ error: 'bad id' })
    const key = `houses/${req.params.id}/house.json`
    if (!(await storage.exists(key))) return reply.code(404).send({ error: 'not found' })
    const house = parseHouse(JSON.parse((await storage.read(key)).toString()))
    reply.header('cache-control', 'public, max-age=60')
    return house
  })
  // Per-house files (plan images for the minimap)
  app.get<{ Params: { id: string; file: string } }>('/api/houses/:id/:file', async (req, reply) => {
    const { id, file } = req.params
    if (!ID.test(id) || !FILE.test(file)) return reply.code(400).send({ error: 'bad path' })
    const key = `houses/${id}/${file}`
    if (!(await storage.exists(key))) return reply.code(404).send({ error: 'not found' })
    reply.header('cache-control', 'public, max-age=3600')
    return reply.type(file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg').send(await storage.read(key))
  })
}
