import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { db } from '../db/client.js'
import * as schema from '../db/schema.js'
import { config } from '../config.js'
import { ac, roles } from './permissions.js'
import { sendMail } from './mailer.js'

export const auth = betterAuth({
  appName: 'Planwalk',
  baseURL: config.publicUrl,
  basePath: '/api/auth',
  secret: config.authSecret,
  trustedOrigins: config.trustedOrigins,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(user.email, 'Confirm your email for Planwalk', `Hi ${user.name},\n\nConfirm your email address to start using Planwalk:\n${url}\n\nIf you didn't sign up, ignore this email.`)
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 30 },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  plugins: [
    organization({
      ac, roles,
      creatorRole: 'owner',
      allowUserToCreateOrganization: true,
      // invitees must verify their email before accepting (Better Auth default) — the link lands on /invite/:id
      sendInvitationEmail: async ({ email, invitation, inviter, organization }) => {
        const link = `${config.publicUrl}/invite/${invitation.id}`
        await sendMail(email, `${inviter.user.name} invited you to ${organization.name} on Planwalk`, `${inviter.user.name} invited you to join ${organization.name} on Planwalk as ${invitation.role}.\n\nAccept the invitation:\n${link}`)
      },
    }),
  ],
})
export type Session = typeof auth.$Infer.Session
