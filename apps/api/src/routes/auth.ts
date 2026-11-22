import type { FastifyInstance } from 'fastify'
import { auth } from '../lib/auth.js'
import { getSession } from '../lib/guard.js'
import { db } from '../db/client.js'
import { member, organization } from '../db/schema.js'
import { eq } from 'drizzle-orm'

// Better Auth handles /api/auth/* (sign-up, sign-in, sessions, organizations, invitations).
export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(req, reply) {
      const url = new URL(req.url, `${req.protocol}://${req.headers.host}`)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (v) headers.append(k, Array.isArray(v) ? v.join(', ') : String(v))
      const res = await auth.handler(new Request(url, { method: req.method, headers, body: req.body ? JSON.stringify(req.body) : undefined }))
      reply.status(res.status)
      res.headers.forEach((value, key) => { if (key !== 'set-cookie') reply.header(key, value) })
      const cookies = res.headers.getSetCookie(); if (cookies.length) reply.header('set-cookie', cookies)
      return reply.send(res.body ? await res.text() : null)
    },
  })

  // Who am I: user, my organizations with my role, and the active one
  app.get('/api/me', async (req, reply) => {
    const s = await getSession(req)
    if (!s) return reply.code(401).send({ error: 'Sign in to continue' })
    const orgs = await db.select({ id: organization.id, name: organization.name, slug: organization.slug, metadata: organization.metadata, role: member.role })
      .from(member).innerJoin(organization, eq(member.organizationId, organization.id)).where(eq(member.userId, s.user.id))
    return {
      user: { id: s.user.id, name: s.user.name, email: s.user.email },
      activeOrganizationId: s.session.activeOrganizationId ?? null,
      organizations: orgs.map(o => ({ ...o, kind: safeKind(o.metadata) })),
    }
  })
}
function safeKind(m: string | null) { try { return (JSON.parse(m ?? '{}') as { kind?: string }).kind ?? 'private' } catch { return 'private' } }
