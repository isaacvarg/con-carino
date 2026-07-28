/**
 * Which optional modules this install runs.
 *
 * Invoices and contributions are the two heaviest features in the app. Some
 * families want the whole ledger; others only want the coverage calendar and
 * find the rest confusing. These flags live on the `CareSettings` singleton
 * alongside the other household-level settings.
 *
 * Kept out of `care.ts` deliberately: the flags are read by route guards, the
 * sidebar, and the job registry, none of which want to pull in the whole care
 * domain.
 */

import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type { CareInvoicingMode } from '#/generated/prisma/enums'
import { CareInvoicingMode as CareInvoicingModeEnum } from '#/generated/prisma/enums'
import { ACTIVITY_ENTITY_TYPES, diffChanges } from '#/lib/activity'
import type { CareModuleFlags } from '#/lib/care-modules'
import { DEFAULT_MODULE_FLAGS, contributionsAllowed } from '#/lib/care-modules'
import { prisma } from '#/lib/prisma'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

const INVOICING_MODES = Object.values(CareInvoicingModeEnum)

/**
 * Every export below is wrapped in `createServerOnlyFn` for the same reason
 * `care.ts` wraps its job entrypoints: route loaders and components import the
 * server fns from this module, which puts it in the client graph. The compiler
 * stubs out server fn handler bodies there, but a plain exported function keeps
 * its references alive — including `prisma`, which drags the whole pg driver
 * into the browser bundle. Wrapping lets the compiler stub these out too.
 */

/** Server-side read. Cheap enough to call per request. */
export const loadModuleFlags = createServerOnlyFn(
  async (): Promise<CareModuleFlags> => {
    const row = await prisma.careSettings.findUnique({
      where: { id: 'default' },
      select: { invoicingMode: true, contributionsEnabled: true },
    })
    if (!row) return DEFAULT_MODULE_FLAGS
    return {
      invoicingMode: row.invoicingMode,
      // Belt and braces: the writer already keeps these consistent, but a flag
      // combination that cannot work should never escape this function.
      contributionsEnabled:
        row.contributionsEnabled && contributionsAllowed(row.invoicingMode),
    }
  },
)

export const requireInvoicingAdvanced = createServerOnlyFn(
  async (): Promise<void> => {
    const { invoicingMode } = await loadModuleFlags()
    if (invoicingMode !== 'ADVANCED') {
      throw new Error(
        'Invoicing is not in advanced mode. Enable it under Settings → Modules.',
      )
    }
  },
)

export const requireInvoicingEnabled = createServerOnlyFn(
  async (): Promise<CareModuleFlags> => {
    const flags = await loadModuleFlags()
    if (flags.invoicingMode === 'OFF') {
      throw new Error(
        'Invoicing is turned off. Enable it under Settings → Modules.',
      )
    }
    return flags
  },
)

export const requireContributionsEnabled = createServerOnlyFn(
  async (): Promise<void> => {
    const { contributionsEnabled } = await loadModuleFlags()
    if (!contributionsEnabled) {
      throw new Error(
        'Contributions are turned off. Enable them under Settings → Modules.',
      )
    }
  },
)

/**
 * Read for the client.
 *
 * Returns defaults rather than throwing when signed out: this runs in the
 * `_app` layout's `beforeLoad`, which fires alongside the redirect to /login,
 * and a throw there would replace the login redirect with an error screen.
 */
export const getModuleFlags = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CareModuleFlags> => {
    const session = await getSession(getRequest(), authConfig)
    if (!session?.user?.id) return DEFAULT_MODULE_FLAGS
    return loadModuleFlags()
  },
)

export const updateCareModuleSettings = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>

    const invoicingMode = input.invoicingMode
    if (
      typeof invoicingMode !== 'string' ||
      !INVOICING_MODES.includes(invoicingMode as CareInvoicingMode)
    ) {
      throw new Error('Invoicing mode is invalid.')
    }

    if (typeof input.contributionsEnabled !== 'boolean') {
      throw new Error('contributionsEnabled must be a boolean.')
    }

    const mode = invoicingMode as CareInvoicingMode
    return {
      invoicingMode: mode,
      // Silently clear rather than reject: the natural gesture is to drop
      // invoicing to simple and expect contributions to follow, not to be told
      // off for a combination the form already disables.
      contributionsEnabled:
        input.contributionsEnabled && contributionsAllowed(mode),
    }
  })
  .handler(async ({ data }): Promise<CareModuleFlags> => {
    const request = getRequest()
    const session = await getSession(request, authConfig)
    const userId = session?.user?.id
    if (!userId) {
      throw new Error('You must be signed in to change modules.')
    }

    // The singleton is created by ensureDefaultTypes/seed, but an upsert keeps
    // this page working on an install where no care settings screen has been
    // opened yet.
    const before = await prisma.careSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', lovedOneName: '' },
      update: {},
      select: { invoicingMode: true, contributionsEnabled: true },
    })

    const after = await prisma.careSettings.update({
      where: { id: 'default' },
      data: {
        invoicingMode: data.invoicingMode,
        contributionsEnabled: data.contributionsEnabled,
      },
      select: { invoicingMode: true, contributionsEnabled: true },
    })

    const changes = diffChanges(before, after, [
      'invoicingMode',
      'contributionsEnabled',
    ])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.care_settings,
        entityId: 'default',
        summary: 'Updated enabled modules',
        changes,
        visibilityUserId: null,
      })
    }

    return {
      invoicingMode: after.invoicingMode,
      contributionsEnabled: after.contributionsEnabled,
    }
  })
