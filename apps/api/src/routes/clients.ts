import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { changeReport, parseDesign, type ChangeReport } from '@planwalk/design'
import { parseHouse } from '@planwalk/house'
import { db } from '../db/client.js'
import { comment, design, feedback, house, houseSeen, member, organization, priceBook, project, projectInvite, projectMember, user } from '../db/schema.js'
import { projectRole, requireProject, requireUser } from '../lib/guard.js'
import { can } from '../lib/permissions.js'
import { sendMail } from '../lib/mailer.js'
import { storage } from '../lib/storage.js'
import { config } from '../config.js'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const Invite = z.object({ email: z.string().trim().toLowerCase().email().max(200), name: z.string().trim().max(80).optional() })
const INVITE_DAYS = 30

/**
 * The architect ↔ client loop: invite a client to one project, and receive what they changed as a report.
 * A client is a member of the project only — never of the organization.
 */
export async function clientRoutes(app: FastifyInstance) {
  // who can see this project as a client, and who was invited
  app.get<{ Params: { id: string } }>('/api/projects/:id/clients', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    const [members, invites] = await Promise.all([
      db.select({ id: projectMember.id, name: user.name, email: user.email, since: projectMember.createdAt }).from(projectMember).innerJoin(user, eq(user.id, projectMember.userId)).where(eq(projectMember.projectId, ctx.project.id)),
      db.select({ id: projectInvite.id, email: projectInvite.email, name: projectInvite.name, createdAt: projectInvite.createdAt, expiresAt: projectInvite.expiresAt })
        .from(projectInvite).where(and(eq(projectInvite.projectId, ctx.project.id), isNull(projectInvite.acceptedAt), isNull(projectInvite.revokedAt))).orderBy(desc(projectInvite.createdAt)),
    ])
    return { members, invites: invites.filter(i => i.expiresAt > new Date()) }
  })

  // invite: an email with a personal link (also returned, so it can be sent by WhatsApp)
  app.post<{ Params: { id: string } }>('/api/projects/:id/clients', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    const body = Invite.safeParse(req.body); if (!body.success) return reply.code(400).send({ error: 'Enter the client’s email address' })
    const token = randomBytes(24).toString('base64url'), id = randomUUID()
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5)
    await db.insert(projectInvite).values({ id, projectId: ctx.project.id, email: body.data.email, name: body.data.name ?? null, tokenHash: hash(token), invitedBy: ctx.session.user.id, expiresAt })
    const link = `${config.publicUrl}/join/${token}`
    const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.project.organizationId)).limit(1)
    await sendMail(body.data.email, `${ctx.session.user.name} מזמין/ה אותך לראות את הבית שלך`,
      `שלום${body.data.name ? ' ' + body.data.name : ''},\n\n${ctx.session.user.name}${org ? ` (${org.name})` : ''} הכין/ה עבורך את "${ctx.project.name}" בתלת-ממד.\nאפשר להיכנס, להסתובב בבית, לשנות חומרים ולהשאיר הערות:\n\n${link}\n\nהקישור אישי ותקף ל-${INVITE_DAYS} ימים.`).catch(e => req.log.warn({ err: e }, 'invite mail failed'))
    return reply.code(201).send({ id, email: body.data.email, name: body.data.name ?? null, expiresAt, link })
  })

  app.delete<{ Params: { id: string; invite: string } }>('/api/projects/:id/clients/invites/:invite', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    await db.update(projectInvite).set({ revokedAt: new Date() }).where(and(eq(projectInvite.id, req.params.invite), eq(projectInvite.projectId, ctx.project.id)))
    return reply.code(204).send()
  })
  app.delete<{ Params: { id: string; member: string } }>('/api/projects/:id/clients/:member', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    await db.delete(projectMember).where(and(eq(projectMember.id, req.params.member), eq(projectMember.projectId, ctx.project.id)))
    return reply.code(204).send()
  })

  // the invitation page (no login needed to see whose home it is)
  const findInvite = async (token: string) => {
    if (!/^[\w-]{20,64}$/.test(token)) return null
    const [i] = await db.select().from(projectInvite).where(eq(projectInvite.tokenHash, hash(token))).limit(1)
    return i && !i.revokedAt && !i.acceptedAt && i.expiresAt > new Date() ? i : null
  }
  app.get<{ Params: { token: string } }>('/api/join/:token', async (req, reply) => {
    const i = await findInvite(req.params.token); if (!i) return reply.code(404).send({ error: 'This invitation is no longer valid. Ask your architect for a new link.' })
    const [p] = await db.select({ name: project.name, org: organization.name }).from(project).innerJoin(organization, eq(organization.id, project.organizationId)).where(eq(project.id, i.projectId)).limit(1)
    const [by] = i.invitedBy ? await db.select({ name: user.name }).from(user).where(eq(user.id, i.invitedBy)).limit(1) : []
    return { project: p?.name ?? '', studio: p?.org ?? '', invitedBy: by?.name ?? null, email: i.email, name: i.name }
  })
  app.post<{ Params: { token: string } }>('/api/join/:token', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const i = await findInvite(req.params.token); if (!i) return reply.code(404).send({ error: 'This invitation is no longer valid. Ask your architect for a new link.' })
    await db.transaction(async tx => {
      await tx.insert(projectMember).values({ id: randomUUID(), projectId: i.projectId, userId: s.user.id, role: 'client' }).onConflictDoNothing()
      await tx.update(projectInvite).set({ acceptedAt: new Date() }).where(eq(projectInvite.id, i.id))
    })
    const homes = await db.select({ id: house.id, version: house.version }).from(house).where(and(eq(house.projectId, i.projectId), isNull(house.draftOf), gt(house.version, 0)))
    // what they walk into now is not "news"; only later versions are announced
    for (const x of homes) await db.insert(houseSeen).values({ houseId: x.id, userId: s.user.id, version: x.version }).onConflictDoNothing()
    const h = homes[0]
    return { projectId: i.projectId, houseId: h?.id ?? null }
  })

  // ── "send to the architect" ─────────────────────────────────────────────────────────────────────────────────
  const Send = z.object({ designId: z.string().uuid(), message: z.string().trim().max(2000).optional() })
  app.post<{ Params: { id: string } }>('/api/houses/:id/feedback', async (req, reply) => {
    const s = await requireUser(req, reply); if (!s) return
    const [h] = await db.select().from(house).where(eq(house.id, req.params.id)).limit(1)
    if (!h?.projectId || h.draftOf) return reply.code(404).send({ error: 'not found' })
    const [p] = await db.select().from(project).where(eq(project.id, h.projectId)).limit(1)
    const role = p ? await projectRole(s.user.id, p.id, p.organizationId) : null
    if (!p || !role) return reply.code(404).send({ error: 'not found' })
    if (!can(role, 'design', 'update')) return reply.code(403).send({ error: `Your role (${role}) can't send design feedback` })
    const body = Send.safeParse(req.body); if (!body.success) return reply.code(400).send({ error: 'Choose the design to send' })
    const [d] = await db.select().from(design).where(and(eq(design.id, body.data.designId), eq(design.houseId, h.id))).limit(1)
    if (!d || (role === 'client' && d.createdBy !== s.user.id)) return reply.code(404).send({ error: 'Design not found' })
    const base = parseHouse(JSON.parse((await storage.read(`houses/${h.id}/house.json`)).toString()))
    const [book] = await db.select({ data: priceBook.data }).from(priceBook).where(eq(priceBook.organizationId, p.organizationId)).limit(1)
    const report: ChangeReport & { comments?: number } = changeReport(base, parseDesign(d.data), book?.data as never)
    report.comments = (await db.select({ id: comment.id }).from(comment).where(and(eq(comment.houseId, h.id), eq(comment.authorId, s.user.id), isNull(comment.resolvedAt)))).length
    const [row] = await db.insert(feedback).values({ id: randomUUID(), projectId: p.id, houseId: h.id, designId: d.id, designVersion: d.version, authorId: s.user.id, message: body.data.message || null, report }).returning()
    // tell the studio
    const team = await db.select({ email: user.email }).from(member).innerJoin(user, eq(user.id, member.userId)).where(and(eq(member.organizationId, p.organizationId), inArray(member.role, ['owner', 'admin', 'architect'])))
    const n = report.changes.length
    for (const t of team) await sendMail(t.email, `${s.user.name} שלח/ה משוב על "${p.name}"`,
      `${s.user.name} סיים/ה לעבור על "${p.name}" ושלח/ה ${n} שינויים${report.comments ? ` ו-${report.comments} הערות` : ''}.\n${body.data.message ? `\n"${body.data.message}"\n` : ''}\nלצפייה בדוח: ${config.publicUrl}/app/p/${p.id}`).catch(e => req.log.warn({ err: e }, 'feedback mail failed'))
    return reply.code(201).send({ id: row.id, createdAt: row.createdAt, report })
  })

  // the studio's inbox for a project
  app.get<{ Params: { id: string } }>('/api/projects/:id/feedback', async (req, reply) => {
    const ctx = await requireProject(req, reply, req.params.id, 'project', 'update'); if (!ctx) return
    return db.select({ id: feedback.id, houseId: feedback.houseId, designId: feedback.designId, designVersion: feedback.designVersion, designName: design.name, author: user.name, message: feedback.message, report: feedback.report, status: feedback.status, createdAt: feedback.createdAt })
      .from(feedback).leftJoin(user, eq(user.id, feedback.authorId)).leftJoin(design, eq(design.id, feedback.designId)).where(eq(feedback.projectId, ctx.project.id)).orderBy(desc(feedback.createdAt))
  })
  app.patch<{ Params: { id: string } }>('/api/feedback/:id', async (req, reply) => {
    const body = z.object({ status: z.enum(['sent', 'seen', 'done']) }).safeParse(req.body); if (!body.success) return reply.code(400).send({ error: 'bad request' })
    const [f] = await db.select().from(feedback).where(eq(feedback.id, req.params.id)).limit(1); if (!f) return reply.code(404).send({ error: 'not found' })
    const ctx = await requireProject(req, reply, f.projectId, 'project', 'update'); if (!ctx) return
    const [row] = await db.update(feedback).set({ status: body.data.status, seenAt: f.seenAt ?? new Date() }).where(eq(feedback.id, f.id)).returning()
    return { id: row.id, status: row.status }
  })
}
