/**
 * When a contributor's transfer falls due, and how much of a monthly share it
 * carries.
 *
 * Mirrors the vocabulary of CarePayInterval in care-invoice.ts (anchor date for
 * multi-week cycles, 1–28 day-of-month for monthly) so the two schedules read
 * the same way, but stays a separate type: pay periods answer "when do we bill
 * a caregiver", these answer "when does someone fund the pot".
 */

export type ContributionCadence = 'WEEKLY' | 'EVERY_N_WEEKS' | 'MONTHLY'

export type ContributionScheduleInput = {
  cadence: ContributionCadence
  /** 1 for WEEKLY; the N for EVERY_N_WEEKS. */
  intervalWeeks: number
  /** Anchors the weekly cycle. Required for WEEKLY / EVERY_N_WEEKS. */
  anchorDate: Date | null
  /** 1–28. Required for MONTHLY. */
  monthDay: number | null
}

const MS_PER_DAY = 86_400_000

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / MS_PER_DAY,
  )
}

/**
 * Due dates in the half-open window (after, until].
 *
 * `after` is exclusive so passing the last generated due date returns only what
 * comes next, which is what makes the generator job idempotent.
 * Returns [] when the schedule is not fully configured.
 */
export function contributionDueDates(
  schedule: ContributionScheduleInput,
  after: Date,
  until: Date,
): Date[] {
  const out: Date[] = []
  const lo = startOfLocalDay(after)
  const hi = startOfLocalDay(until)
  if (hi.getTime() < lo.getTime()) return out

  if (schedule.cadence === 'MONTHLY') {
    const day = schedule.monthDay
    if (day === null || !Number.isInteger(day) || day < 1 || day > 28) return out

    let year = lo.getFullYear()
    let month = lo.getMonth()
    // Walk from the month containing `after`, then forward.
    for (let guard = 0; guard < 240; guard += 1) {
      const candidate = new Date(year, month, day)
      if (candidate.getTime() > hi.getTime()) break
      if (candidate.getTime() > lo.getTime()) out.push(candidate)
      month += 1
      if (month > 11) {
        month = 0
        year += 1
      }
    }
    return out
  }

  const interval = schedule.cadence === 'WEEKLY' ? 1 : schedule.intervalWeeks
  if (!Number.isInteger(interval) || interval < 1) return out
  if (!schedule.anchorDate) return out

  const anchor = startOfLocalDay(schedule.anchorDate)
  const step = interval * 7

  // Jump straight to the first cycle boundary after `lo` rather than walking
  // from the anchor, which could be years back.
  const elapsed = daysBetween(anchor, lo)
  let cycles = Math.ceil((elapsed + 1) / step)
  if (cycles < 0) cycles = 0

  for (let guard = 0; guard < 1000; guard += 1) {
    const candidate = addDays(anchor, cycles * step)
    if (candidate.getTime() > hi.getTime()) break
    if (candidate.getTime() > lo.getTime()) out.push(candidate)
    cycles += 1
  }
  return out
}

/**
 * Convert a monthly share into the amount for one transfer at this cadence.
 *
 * Weekly cadences use 12/52 of a month per week rather than a calendar month
 * divided by its own length, so every transfer is the same size and a year of
 * them adds up to a year of monthly shares.
 */
export function proRateToCadence(
  monthlyShare: number,
  schedule: ContributionScheduleInput,
): number {
  if (!Number.isFinite(monthlyShare)) {
    throw new Error('Monthly share is not a finite number.')
  }
  if (schedule.cadence === 'MONTHLY') {
    return Math.round(monthlyShare * 10_000) / 10_000
  }
  const interval = schedule.cadence === 'WEEKLY' ? 1 : schedule.intervalWeeks
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error('Interval must be a whole number of weeks.')
  }
  return Math.round(((monthlyShare * 12) / 52) * interval * 10_000) / 10_000
}

/**
 * The figure actually transferred: the base share plus whatever balance was
 * carried in, floored at zero. A credit larger than the base zeroes this
 * transfer and the excess stays in the ledger to shrink the next one.
 */
export function transferAmountFor(
  baseAmount: number,
  carriedBalance: number,
): number {
  const total = Math.round((baseAmount + carriedBalance) * 10_000) / 10_000
  return total > 0 ? total : 0
}
