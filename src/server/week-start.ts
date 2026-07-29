/**
 * The household's week-start preference.
 *
 * Reads the `weekStartsOn` column off the `CareSettings` singleton, which is
 * already the household settings row. Kept out of `care.ts` for the same reason
 * `care-modules.ts` is: this value is read by the transactions UI and the `_app`
 * layout, neither of which wants the whole care domain pulled in behind it.
 *
 * Every export is wrapped in `createServerOnlyFn` or is a server fn, for the
 * reason spelled out at the top of `care-modules.ts`: route loaders and
 * components import from here, which puts this module in the client graph, and a
 * plain exported function would keep `prisma` alive there and drag the pg driver
 * into the browser bundle.
 */

import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { ACTIVITY_ENTITY_TYPES, diffChanges } from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import {
  DEFAULT_WEEK_START,
  isWeekStart,
  toWeekStart,
  type WeekStart,
} from '#/lib/week-start'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

/** Server-side read. Cheap enough to call per request. */
export const loadWeekStart = createServerOnlyFn(async (): Promise<WeekStart> => {
  const row = await prisma.careSettings.findUnique({
    where: { id: 'default' },
    select: { weekStartsOn: true },
  })
  // Coerce rather than trust: the column is a plain Int, so a hand-edited row
  // should degrade to Sunday instead of producing a nonsense week grid.
  return toWeekStart(row?.weekStartsOn)
})

/**
 * Read for the client.
 *
 * Returns the default rather than throwing when signed out, for the same reason
 * `getModuleFlags` does: this runs in the `_app` layout's `beforeLoad`, which
 * fires alongside the redirect to /login, and a throw there would replace the
 * login redirect with an error screen.
 */
export const getWeekStart = createServerFn({ method: 'GET' }).handler(
  async (): Promise<WeekStart> => {
    const session = await getSession(getRequest(), authConfig)
    if (!session?.user?.id) return DEFAULT_WEEK_START
    return loadWeekStart()
  },
)

export const updateWeekStart = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    if (!isWeekStart(input.weekStartsOn)) {
      throw new Error('Week start must be Sunday (0) or Monday (1).')
    }
    return { weekStartsOn: input.weekStartsOn }
  })
  .handler(async ({ data }): Promise<WeekStart> => {
    const session = await getSession(getRequest(), authConfig)
    const userId = session?.user?.id
    if (!userId) {
      throw new Error('You must be signed in to change preferences.')
    }

    // Upsert first, like updateCareModuleSettings: the singleton is normally
    // created by the seed, but this keeps the page working on an install where
    // no care settings screen has been opened yet.
    const before = await prisma.careSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', lovedOneName: '' },
      update: {},
      select: { weekStartsOn: true },
    })

    const after = await prisma.careSettings.update({
      where: { id: 'default' },
      data: { weekStartsOn: data.weekStartsOn },
      select: { weekStartsOn: true },
    })

    const changes = diffChanges(before, after, ['weekStartsOn'])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.care_settings,
        entityId: 'default',
        summary:
          data.weekStartsOn === 1
            ? 'Set weeks to start on Monday'
            : 'Set weeks to start on Sunday',
        changes,
        visibilityUserId: null,
      })
    }

    return toWeekStart(after.weekStartsOn)
  })
