/**
 * The job registry.
 *
 * Each `run` dynamically imports its implementation module rather than
 * importing at the top of this file. That keeps the registry cheap for callers
 * that only want to enumerate job names (the HTTP GET summary), and it breaks
 * the import cycle that would otherwise form: care.ts starts the dev tick,
 * which reaches the runner, which reaches this registry.
 */

export type JobDefinition = {
  name: string
  /** Bucket size. A job runs at most once per bucket, across all processes. */
  intervalMs: number
  /** A RUNNING row older than this is presumed dead and swept to FAILED. */
  staleAfterMs: number
  /**
   * When false (the default), a fresh RUNNING row blocks a new claim. The
   * bucket unique alone does not prevent bucket N and N+1 overlapping when a
   * run is slower than one interval.
   */
  overlappable?: boolean
  run: (now: Date) => Promise<unknown>
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const JOBS: readonly JobDefinition[] = [
  {
    name: 'care-complete-due-shifts',
    intervalMs: 5 * MINUTE,
    staleAfterMs: 10 * MINUTE,
    run: async (now) => {
      const { runCompleteDueShifts } = await import('#/server/care')
      return runCompleteDueShifts(now)
    },
  },
  {
    name: 'care-create-pay-period-invoices',
    intervalMs: HOUR,
    staleAfterMs: 30 * MINUTE,
    run: async (now) => {
      const { runCreatePayPeriodInvoices } = await import('#/server/care')
      return runCreatePayPeriodInvoices(now)
    },
  },
  {
    // Keeps a rolling window of occurrences materialized so assignment rules
    // have slots to fill — and later, so the forecast has windows to price —
    // even when nobody opens the calendar.
    name: 'care-materialize-rolling-window',
    intervalMs: 24 * HOUR,
    staleAfterMs: HOUR,
    run: async (now) => {
      const { runMaterializeRollingWindow } = await import('#/server/care')
      return runMaterializeRollingWindow(now)
    },
  },
  {
    name: 'care-funding-period-open',
    intervalMs: 6 * HOUR,
    staleAfterMs: 15 * MINUTE,
    run: async (now) => {
      const { runOpenFundingPeriod } = await import(
        '#/server/care-contributions'
      )
      return runOpenFundingPeriod(now)
    },
  },
  {
    // Runs after opening so a period that just ended is closed against a
    // freshly opened successor.
    name: 'care-funding-period-close',
    intervalMs: 6 * HOUR,
    staleAfterMs: 30 * MINUTE,
    run: async (now) => {
      const { runCloseFundingPeriods } = await import(
        '#/server/care-contributions'
      )
      return runCloseFundingPeriods(now)
    },
  },
  {
    name: 'care-contributions-generate',
    intervalMs: 6 * HOUR,
    staleAfterMs: 15 * MINUTE,
    run: async (now) => {
      const { runGenerateContributions } = await import(
        '#/server/care-contributions'
      )
      return runGenerateContributions(now)
    },
  },
  {
    name: 'care-contributions-autopost',
    intervalMs: 6 * HOUR,
    staleAfterMs: 15 * MINUTE,
    run: async (now) => {
      const { runAutoPostContributions } = await import(
        '#/server/care-contributions'
      )
      return runAutoPostContributions(now)
    },
  },
]

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((job) => job.name === name)
}
