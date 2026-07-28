import { floorToInterval } from '#/lib/job-schedule'
import { prisma } from '#/lib/prisma'
import { isUniqueViolation } from '#/lib/prisma-errors'
import type { JobDefinition } from '#/server/jobs/registry'
import { JOBS, findJob } from '#/server/jobs/registry'

export type JobOutcome = {
  job: string
  status: 'succeeded' | 'failed' | 'skipped'
  /** Why a run was skipped, or the truncated message when it failed. */
  reason?: string
  scheduledFor?: string
  durationMs?: number
  result?: unknown
}

function toErrorText(err: unknown): string {
  const text = err instanceof Error ? (err.stack ?? err.message) : String(err)
  return text.slice(0, 2000)
}

/**
 * Run one job if its current bucket is unclaimed.
 *
 * The claim is an insert against `@@unique([jobName, scheduledFor])`: whoever
 * inserts first owns the bucket and everyone else gets P2002 and skips. That
 * is what makes the dev in-process tick and the production cron container safe
 * to run simultaneously — a double fire costs one failed insert, not a double
 * execution.
 */
export async function runJob(
  job: JobDefinition,
  now: Date = new Date(),
): Promise<JobOutcome> {
  const scheduledFor = floorToInterval(now, job.intervalMs)

  // Sweep runs that died without recording an outcome. The bucket key has
  // already moved on, so this cannot unwedge anything — it exists so the
  // job history does not show a run as perpetually RUNNING.
  await prisma.jobRun.updateMany({
    where: {
      jobName: job.name,
      status: 'RUNNING',
      startedAt: { lt: new Date(now.getTime() - job.staleAfterMs) },
    },
    data: {
      status: 'FAILED',
      finishedAt: now,
      error: 'Stale: the runner exited without recording an outcome.',
    },
  })

  if (!job.overlappable) {
    const inFlight = await prisma.jobRun.findFirst({
      where: { jobName: job.name, status: 'RUNNING' },
      select: { id: true },
    })
    if (inFlight) {
      return { job: job.name, status: 'skipped', reason: 'already-running' }
    }
  }

  let claimId: string
  try {
    const claim = await prisma.jobRun.create({
      data: { jobName: job.name, scheduledFor, status: 'RUNNING' },
      select: { id: true },
    })
    claimId = claim.id
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        job: job.name,
        status: 'skipped',
        reason: 'bucket-already-claimed',
        scheduledFor: scheduledFor.toISOString(),
      }
    }
    throw err
  }

  const startedMs = Date.now()
  try {
    const result = await job.run(now)
    const durationMs = Date.now() - startedMs
    await prisma.jobRun.update({
      where: { id: claimId },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        durationMs,
        result: result === undefined ? undefined : (result as object),
      },
    })
    return {
      job: job.name,
      status: 'succeeded',
      scheduledFor: scheduledFor.toISOString(),
      durationMs,
      result,
    }
  } catch (err) {
    const durationMs = Date.now() - startedMs
    await prisma.jobRun.update({
      where: { id: claimId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        durationMs,
        error: toErrorText(err),
      },
    })
    return {
      job: job.name,
      status: 'failed',
      scheduledFor: scheduledFor.toISOString(),
      durationMs,
      reason: toErrorText(err),
    }
  }
}

/**
 * Run every registered job whose bucket is unclaimed.
 *
 * A failing job is recorded and reported but never aborts the others — one
 * broken job must not starve the rest. The caller decides what to do with a
 * non-empty set of failures (the HTTP handler turns it into a non-200).
 */
export async function runDueJobs(now: Date = new Date()): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = []
  for (const job of JOBS) {
    try {
      outcomes.push(await runJob(job, now))
    } catch (err) {
      // Only reachable if claiming itself threw (e.g. the DB is down).
      outcomes.push({
        job: job.name,
        status: 'failed',
        reason: toErrorText(err),
      })
    }
  }
  return outcomes
}

/** Force-run a single job by name, ignoring whether its bucket is due. */
export async function runJobByName(
  name: string,
  now: Date = new Date(),
): Promise<JobOutcome> {
  const job = findJob(name)
  if (!job) {
    return { job: name, status: 'skipped', reason: 'unknown-job' }
  }
  return runJob(job, now)
}

export type JobSummary = {
  job: string
  intervalMs: number
  lastRunAt: string | null
  lastStatus: string | null
  lastDurationMs: number | null
  lastError: string | null
}

/** Last-run summary per registered job, for a settings panel. */
export async function listJobSummaries(): Promise<JobSummary[]> {
  return Promise.all(
    JOBS.map(async (job) => {
      const last = await prisma.jobRun.findFirst({
        where: { jobName: job.name },
        orderBy: { startedAt: 'desc' },
      })
      return {
        job: job.name,
        intervalMs: job.intervalMs,
        lastRunAt: last?.startedAt.toISOString() ?? null,
        lastStatus: last?.status ?? null,
        lastDurationMs: last?.durationMs ?? null,
        lastError: last?.error ?? null,
      }
    }),
  )
}
