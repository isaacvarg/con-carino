/**
 * Interval bucketing for the job runner.
 *
 * Buckets are computed from the epoch, not from local calendar time, so they
 * are immune to DST shifts and identical across processes. That matters
 * because the bucket start is the idempotency key a runner inserts to claim a
 * run — the dev tick and the prod cron container must agree on which bucket
 * "now" belongs to, or they would each claim their own and double-run.
 */

function assertInterval(intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('intervalMs must be a positive finite number.')
  }
}

/** Start of the interval bucket containing `now`. */
export function floorToInterval(now: Date, intervalMs: number): Date {
  assertInterval(intervalMs)
  const ms = now.getTime()
  if (!Number.isFinite(ms)) {
    throw new Error('now must be a valid date.')
  }
  return new Date(Math.floor(ms / intervalMs) * intervalMs)
}

/**
 * Whether a bucket newer than `lastBucket` has opened as of `now`.
 * `null` means the job has never run, which is always due.
 */
export function isJobDue(
  lastBucket: Date | null,
  now: Date,
  intervalMs: number,
): boolean {
  assertInterval(intervalMs)
  if (lastBucket === null) return true
  return floorToInterval(now, intervalMs).getTime() > lastBucket.getTime()
}

/** Start of the bucket immediately after the one containing `now`. */
export function nextBucketStart(now: Date, intervalMs: number): Date {
  return new Date(floorToInterval(now, intervalMs).getTime() + intervalMs)
}
