import type { FastifyInstance } from 'fastify'
import { auth } from '../lib/auth.js'
import { getSession } from '../lib/guard.js'
import { db } from '../db/client.js'
import { house, member, organization, project, projectMember } from '../db/schema.js'
import { eq, inArray } from 'drizzle-orm'

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
      // homes this person was invited to as a client (not a member of the studio)
      clientOf: await clientHomes(s.user.id),
    }
  })
}
function safeKind(m: string | null) { try { return (JSON.parse(m ?? '{}') as { kind?: string }).kind ?? 'private' } catch { return 'private' } }

async function clientHomes(userId: string) {
  const rows = await db.select({ projectId: project.id, name: project.name, address: project.address, studio: organization.name })
    .from(projectMember).innerJoin(project, eq(project.id, projectMember.projectId)).innerJoin(organization, eq(organization.id, project.organizationId)).where(eq(projectMember.userId, userId))
  if (!rows.length) return []
  const houses = await db.select({ id: house.id, projectId: house.projectId, title: house.title }).from(house).where(inArray(house.projectId, rows.map(r => r.projectId)))
  return rows.map(r => ({ ...r, houses: houses.filter(h => h.projectId === r.projectId).map(h => ({ id: h.id, title: h.title })) }))
}
