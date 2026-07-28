/**
 * The pure half of the module flags.
 *
 * Deliberately separate from `#/server/care-modules`: that module imports
 * Prisma at the top level, and a client component importing *any* plain export
 * from it drags the whole database client into the browser bundle. Server
 * functions are safe to import from a component because their handlers are
 * stripped — ordinary helpers are not.
 */

import type { CareInvoicingMode } from '#/generated/prisma/enums'

export type CareModuleFlags = {
  invoicingMode: CareInvoicingMode
  contributionsEnabled: boolean
}

/**
 * What a brand new install gets. Matches the Prisma column defaults so an
 * existing install keeps everything it already had.
 */
export const DEFAULT_MODULE_FLAGS: CareModuleFlags = {
  invoicingMode: 'ADVANCED',
  contributionsEnabled: true,
}

/**
 * Contributions charge each person their share of a period's *actual* cost,
 * summed from real invoice rows. SIMPLE and OFF never create those rows, so
 * enabling contributions without ADVANCED invoicing would close every funding
 * period at zero.
 */
export function contributionsAllowed(mode: CareInvoicingMode): boolean {
  return mode === 'ADVANCED'
}
