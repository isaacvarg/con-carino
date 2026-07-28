/**
 * The job registry.
 *
 * Each `run` dynamically imports its implementation module rather than
 * importing at the top of this file. That keeps the registry cheap for callers
 * that only want to enumerate job names (the HTTP GET summary), and it breaks
 * the import cycle that would otherwise form: care.ts starts the dev tick,
 * which reaches the runner, which reaches this registry.
 */

/**
 * What a job returns when its module is switched off. Recorded like any other
 * result, so `/api/jobs` shows a disabled module rather than silence.
 */
const SKIPPED = { skipped: 'module-disabled' } as const

async function invoicingIsAdvanced() {
  const { loadModuleFlags } = await import('#/server/care-modules')
  return (await loadModuleFlags()).invoicingMode === 'ADVANCED'
}

async function contributionsAreEnabled() {
  const { loadModuleFlags } = await import('#/server/care-modules')
  return (await loadModuleFlags()).contributionsEnabled
}

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
      // Simple invoicing prices the schedule on view instead; generating rows
      // nobody can see or settle would just accrue a hidden backlog.
      if (!(await invoicingIsAdvanced())) return SKIPPED
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
      if (!(await contributionsAreEnabled())) return SKIPPED
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
      if (!(await contributionsAreEnabled())) return SKIPPED
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
      if (!(await contributionsAreEnabled())) return SKIPPED
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
      if (!(await contributionsAreEnabled())) return SKIPPED
      const { runAutoPostContributions } = await import(
        '#/server/care-contributions'
      )
      return runAutoPostContributions(now)
    },
  },
  {
    // Backstop for a balance that slipped below its floor without a transaction
    // create to notice — an edited row, a changed opening balance. The hook in
    // createTransaction handles the common case the moment it happens, so this
    // only has to catch the drift. Not module-gated: the flags above mean "care
    // features", and automations are ledger features.
    name: 'automations-low-balance',
    // Hourly, not faster: the re-alert cadence is daily, so a tighter sweep
    // finds nothing new and only fills up job_runs.
    intervalMs: HOUR,
    staleAfterMs: 15 * MINUTE,
    run: async (now) => {
      const { runLowBalanceAlerts } = await import('#/server/automations')
      return runLowBalanceAlerts(now)
    },
  },
]

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((job) => job.name === name)
}
