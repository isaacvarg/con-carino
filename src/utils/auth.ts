import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from '@auth/core/providers/google'
import Discord from '@auth/core/providers/discord'
import type { StartAuthJSConfig } from 'start-authjs'
import { prisma } from '#/lib/prisma'

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
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
}
