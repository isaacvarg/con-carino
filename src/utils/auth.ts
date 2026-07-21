import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from '@auth/core/providers/google'
import Discord from '@auth/core/providers/discord'
import Resend from '@auth/core/providers/resend'
import type { StartAuthJSConfig } from 'start-authjs'
import { ACTIVITY_ENTITY_TYPES } from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import { logActivity } from '#/server/activity-log'
import { ensureCarePersonForUser } from '#/server/ensure-care-person'

declare module 'start-authjs' {
  interface AuthUser {
    isAdmin?: boolean
  }
}

// Magic-link sender. Resend rejects any From whose domain is not verified on
// the account, and it does so at send time with an opaque 422 — so fail here,
// at boot, where the cause is obvious.
function getEmailFrom(): string {
  const from = process.env.AUTH_EMAIL_FROM?.trim()
  if (!from) {
    throw new Error('AUTH_EMAIL_FROM is not configured.')
  }
  return from
}

export const authConfig: StartAuthJSConfig = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  basePath: '/api/auth',
  session: {
    strategy: 'database',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    }),
    // apiKey defaults to AUTH_RESEND_KEY.
    Resend({
      from: getEmailFrom(),
    }),
  ],
  pages: {
    // An expired or already-used link lands back on the styled login card as
    // /login?error=Verification rather than the built-in Auth.js error screen.
    error: '/login',
    verifyRequest: '/verify-request',
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return

      const adminCount = await prisma.user.count({ where: { isAdmin: true } })
      if (adminCount === 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isAdmin: true },
        })
      }

      await ensureCarePersonForUser({
        id: user.id,
        name: user.name,
        email: user.email,
      })
    },
    async signIn({ user }) {
      if (!user.id) return

      const adminCount = await prisma.user.count({ where: { isAdmin: true } })
      if (adminCount === 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isAdmin: true },
        })
      }

      await logActivity({
        actorUserId: user.id,
        action: 'CREATE',
        entityType: ACTIVITY_ENTITY_TYPES.session,
        entityId: null,
        summary: 'Signed in',
        visibilityUserId: null,
      })
    },
    async signOut(message) {
      const userId =
        'session' in message && message.session && 'userId' in message.session
          ? (message.session as { userId?: string }).userId
          : undefined
      if (!userId) return
      await logActivity({
        actorUserId: userId,
        action: 'DELETE',
        entityType: ACTIVITY_ENTITY_TYPES.session,
        entityId: null,
        summary: 'Signed out',
        visibilityUserId: null,
      })
    },
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        const isAdmin = Boolean(
          (user as { isAdmin?: boolean | null }).isAdmin,
        )
        Object.assign(session.user, { isAdmin })
      }
      return session
    },
  },
}
