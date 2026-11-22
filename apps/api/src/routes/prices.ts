import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { DEFAULT_PRICES } from '@planwalk/design'
import { db } from '../db/client.js'
import { priceBook } from '../db/schema.js'
import { requireUser, roleIn } from '../lib/guard.js'

// Prices are numbers ≥ 0 under known keys; anything else is rejected so a typo can't break every quote.
const money = z.number().min(0).max(1_000_000)
const keysOf = (o: object) => Object.keys(o) as [string, ...string[]]
const Book = z.object({
  vat: z.number().min(0).max(.5).optional(),
  finishes: z.partialRecord(z.enum(keysOf(DEFAULT_PRICES.finishes)), money).optional(),
  fronts: z.partialRecord(z.enum(keysOf(DEFAULT_PRICES.fronts)), z.number().min(.1).max(10)).optional(),
  modules: z.partialRecord(z.enum(keysOf(DEFAULT_PRICES.modules)), money).optional(),
  kitchenInstallPerM: money.optional(),
  windowPerM2: z.partialRecord(z.enum(keysOf(DEFAULT_PRICES.windowPerM2)), money).optional(),
  windowChangeFee: money.optional(),
  wallMovePerM2: money.optional(),
}).strict()

export async function priceRoutes(app: FastifyInstance) {
  app.get<{ Params: { org: string } }>('/api/orgs/:org/prices', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const role = await roleIn(s.user.id, req.params.org); if (!role) return reply.code(404).send({ error: 'not found' })
    const [row] = await db.select().from(priceBook).where(eq(priceBook.organizationId, req.params.org)).limit(1)
    return { defaults: DEFAULT_PRICES, prices: row?.data ?? {}, updatedAt: row?.updatedAt ?? null, canEdit: role === 'owner' || role === 'admin' }
  })
  app.put<{ Params: { org: string } }>('/api/orgs/:org/prices', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const role = await roleIn(s.user.id, req.params.org); if (!role) return reply.code(404).send({ error: 'not found' })
    if (role !== 'owner' && role !== 'admin') return reply.code(403).send({ error: `Your role (${role}) can't change prices` })
    const b = Book.safeParse(req.body)
    if (!b.success) return reply.code(400).send({ error: 'Check the prices: ' + (b.error.issues[0]?.path.join('.') ?? '') })
    const [row] = await db.insert(priceBook).values({ organizationId: req.params.org, data: b.data, updatedBy: s.user.id })
      .onConflictDoUpdate({ target: priceBook.organizationId, set: { data: b.data, updatedBy: s.user.id, updatedAt: new Date() } }).returning()
    return { prices: row.data, updatedAt: row.updatedAt }
  })
}
