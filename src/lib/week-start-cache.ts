/**
 * Client-side memo for the household week-start preference.
 *
 * Same trade-off and same TTL as `care-module-flags.ts` and
 * `transaction-type-registry.ts`: the `_app` layout's `beforeLoad` runs on every
 * navigation, and this setting changes roughly never.
 */

import { DEFAULT_WEEK_START, type WeekStart } from '#/lib/week-start'
import { getWeekStart } from '#/server/week-start'

const WEEK_START_TTL_MS = 15_000

type WeekStartCache = {
  weekStartsOn: WeekStart
  fetchedAt: number
}

let inFlight: Promise<WeekStartCache> | null = null
let cache: WeekStartCache | null = null

export async function getWeekStartCached(): Promise<WeekStart> {
  // On the server every request is already isolated; a module-scoped cache
  // there would leak one request's data into another process's response.
  if (typeof window === 'undefined') {
    return getWeekStart()
  }
  const cached = cache
  if (cached && Date.now() - cached.fetchedAt < WEEK_START_TTL_MS) {
    return cached.weekStartsOn
  }
  if (!inFlight) {
    inFlight = getWeekStart()
      .then((weekStartsOn) => {
        cache = { weekStartsOn, fetchedAt: Date.now() }
        return cache
      })
      .catch(() => {
        // A failed read should not wedge the whole layout; fall back to the
        // default for this navigation and retry on the next one.
        return { weekStartsOn: DEFAULT_WEEK_START, fetchedAt: 0 }
      })
      .finally(() => {
        inFlight = null
      })
  }
  return (await inFlight).weekStartsOn
}

/**
 * Drops the memo so a save on Settings → Preferences shows up on the very next
 * `router.invalidate()` rather than up to `WEEK_START_TTL_MS` later.
 */
export function clearWeekStartCache() {
  cache = null
}
