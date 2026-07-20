import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from '@auth/core/providers/google'
import Discord from '@auth/core/providers/discord'
import Resend from '@auth/core/providers/resend'
import type { StartAuthJSConfig } from 'start-authjs'
import { prisma } from '#/lib/prisma'

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
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
}
