/**
 * Client-side memo for the transaction type registry.
 *
 * Same trade-off and same TTL as `care-module-flags.ts`: the `_app` layout's
 * `beforeLoad` runs on every navigation, and the type list changes about as
 * often as the module flags do.
 */

import type { TransactionTypeDto } from '#/lib/transaction-types'
import { listTransactionTypes } from '#/server/transaction-types'

const TYPES_TTL_MS = 15_000

type TypesCache = {
  types: TransactionTypeDto[]
  fetchedAt: number
}

let inFlight: Promise<TypesCache> | null = null
let cache: TypesCache | null = null

export async function getTransactionTypesCached(): Promise<
  TransactionTypeDto[]
> {
  // On the server every request is already isolated; a module-scoped cache
  // there would leak one request's data into another process's response.
  if (typeof window === 'undefined') {
    return listTransactionTypes()
  }
  const cached = cache
  if (cached && Date.now() - cached.fetchedAt < TYPES_TTL_MS) {
    return cached.types
  }
  if (!inFlight) {
    inFlight = listTransactionTypes()
      .then((types) => {
        cache = { types, fetchedAt: Date.now() }
        return cache
      })
      .finally(() => {
        inFlight = null
      })
  }
  return (await inFlight).types
}

/**
 * Drops the memo so a save on Settings → Transaction types shows up on the very
 * next `router.invalidate()` rather than up to `TYPES_TTL_MS` later.
 */
export function clearTransactionTypesCache() {
  cache = null
}
