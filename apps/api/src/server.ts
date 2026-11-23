import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { houseRoutes } from './routes/houses.js'
import { designRoutes } from './routes/designs.js'
import { priceRoutes } from './routes/prices.js'
import { projectRoutes } from './routes/projects.js'
import { uploadRoutes } from './routes/uploads.js'
import { authRoutes } from './routes/auth.js'
import { runMigrations } from './db/client.js'
import { seed } from './db/seed.js'

await runMigrations()
await seed()

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 1024 * 1024 })

await app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') ?? false, credentials: true })
await app.register(multipart)

// Shared 3D asset library (textures, models, sky): long-lived, immutable cache
await app.register(fastifyStatic, {
  root: path.join(config.storageDir, 'library'),
  prefix: '/api/library/',
  decorateReply: false,
  immutable: true,
  maxAge: '30d',
})

app.get('/api/health', async () => ({ ok: true }))
await app.register(authRoutes)
await app.register(houseRoutes)
await app.register(designRoutes)
await app.register(priceRoutes)
await app.register(projectRoutes)
await app.register(uploadRoutes)

// Production: serve the built web app from the same process (SPA fallback to index.html)
if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
  // wildcard (default): files are looked up on disk per request, so a rebuild with new hashed names works without a restart
  await app.register(fastifyStatic, { root: config.webDist, prefix: '/', index: false })
  app.setNotFoundHandler((req, reply) => {
    const pathname = req.url.split('?')[0]
    // API routes and missing files (anything with an extension) are real 404s; app routes get the SPA shell
    if (pathname.startsWith('/api/') || /\.[a-z0-9]+$/i.test(pathname)) return reply.code(404).send({ error: 'not found' })
    return reply.type('text/html').header('cache-control', 'no-cache').sendFile('index.html', config.webDist)
  })
  app.get('/', (_req, reply) => reply.type('text/html').header('cache-control', 'no-cache').sendFile('index.html', config.webDist))
}

app.listen({ port: config.port, host: config.host }).catch(err => { app.log.error(err); process.exit(1) })
