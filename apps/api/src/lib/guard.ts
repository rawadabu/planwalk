import type { FastifyReply, FastifyRequest } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { and, eq } from 'drizzle-orm'
import { auth } from './auth.js'
import { db } from '../db/client.js'
import { member, project, projectMember } from '../db/schema.js'
import { can, type Resource } from './permissions.js'

export async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
}

/** 401 unless signed in. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const s = await getSession(req)
  if (!s) { reply.code(401).send({ error: 'Sign in to continue' }); return null }
  return s
}

/** The caller's role in an organization, or null if not a member. */
export async function roleIn(userId: string, organizationId: string): Promise<string | null> {
  const [m] = await db.select({ role: member.role }).from(member).where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))).limit(1)
  return m?.role ?? null
}

/** The caller's role for one project: their role in its organization, or 'client' if they were invited to this project only. */
export async function projectRole(userId: string, projectId: string, organizationId: string): Promise<string | null> {
  const org = await roleIn(userId, organizationId)
  if (org) return org
  const [m] = await db.select({ role: projectMember.role }).from(projectMember).where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId))).limit(1)
  return m?.role ?? null
}

/** Load a project and check the caller may `action` on `resource` in its organization (403/404 otherwise). */
export async function requireProject(req: FastifyRequest, reply: FastifyReply, projectId: string, resource: Resource, action: string) {
  const s = await requireUser(req, reply); if (!s) return null
  const [p] = await db.select().from(project).where(eq(project.id, projectId)).limit(1)
  if (!p) { reply.code(404).send({ error: 'Project not found' }); return null }
  const role = await projectRole(s.user.id, p.id, p.organizationId)
  if (!role) { reply.code(404).send({ error: 'Project not found' }); return null }       // don't reveal other orgs' projects
  if (!can(role, resource, action)) { reply.code(403).send({ error: `Your role (${role}) can't ${action} ${resource}s` }); return null }
  return { session: s, project: p, role }
}
