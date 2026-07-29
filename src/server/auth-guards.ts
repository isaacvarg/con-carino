/**
 * Shared session guards.
 *
 * Most server modules still carry their own private `requireUserId` with a
 * module-specific error message; those are left alone. What matters here is
 * that `requireAdminId` has exactly one definition — admin is the boundary
 * that gates destructive work, so a second drifting copy is a real hazard.
 *
 * Everything is wrapped in `createServerOnlyFn`, and must stay that way. These
 * are imported by modules that route files pull into the client graph. The
 * compiler stubs out server fn handler bodies there, but a plain exported
 * function keeps its references alive — including `prisma`, which then fails to
 * evaluate in the browser and takes hydration down app-wide. Same rule, and
 * same reason, as `runCompleteDueShifts` in src/server/care.ts.
 */

import { createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { prisma } from '#/lib/prisma'
import { authConfig } from '#/utils/auth'

export const requireUserId = createServerOnlyFn(
  async (): Promise<string> => {
    const request = getRequest()
    const session = await getSession(request, authConfig)
    const userId = session?.user?.id
    if (!userId) {
      throw new Error('You must be signed in.')
    }
    return userId
  },
)

export const requireAdminId = createServerOnlyFn(
  async (): Promise<string> => {
    const request = getRequest()
    const session = await getSession(request, authConfig)
    const userId = session?.user?.id
    if (!userId) {
      throw new Error('You must be signed in.')
    }
    if (!session.user?.isAdmin) {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      })
      if (!row?.isAdmin) {
        throw new Error('Admin access required.')
      }
    }
    return userId
  },
)

/**
 * Whether the caller is an admin, without throwing.
 *
 * For paths where admin unlocks extra behaviour rather than gating access —
 * the caller decides what to do with a `false`.
 */
export const isCallerAdmin = createServerOnlyFn(
  async (): Promise<boolean> => {
    const request = getRequest()
    const session = await getSession(request, authConfig)
    const userId = session?.user?.id
    if (!userId) return false
    if (session.user?.isAdmin) return true
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    })
    return Boolean(row?.isAdmin)
  },
)
