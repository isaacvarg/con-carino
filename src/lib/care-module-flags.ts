/**
 * Client-side memo for the module flags.
 *
 * The `_app` layout's `beforeLoad` runs on every navigation, and these flags
 * change about once a year — same trade-off (and same TTL) as the session cache
 * in `src/routes/__root.tsx`.
 */

import type { CareModuleFlags } from '#/lib/care-modules'
import { getModuleFlags } from '#/server/care-modules'

const MODULES_TTL_MS = 15_000

type ModulesCache = {
  modules: CareModuleFlags
  fetchedAt: number
}

let inFlight: Promise<ModulesCache> | null = null
let cache: ModulesCache | null = null

export async function getModuleFlagsCached(): Promise<CareModuleFlags> {
  // On the server every request is already isolated; a module-scoped cache
  // there would leak one request's flags into another process's response.
  if (typeof window === 'undefined') {
    return getModuleFlags()
  }
  const cached = cache
  if (cached && Date.now() - cached.fetchedAt < MODULES_TTL_MS) {
    return cached.modules
  }
  if (!inFlight) {
    inFlight = getModuleFlags()
      .then((modules) => {
        cache = { modules, fetchedAt: Date.now() }
        return cache
      })
      .finally(() => {
        inFlight = null
      })
  }
  return (await inFlight).modules
}

/**
 * Drops the memo so a save on Settings → Modules shows up on the very next
 * `router.invalidate()` rather than up to `MODULES_TTL_MS` later.
 */
export function clearModuleFlagsCache() {
  cache = null
}
