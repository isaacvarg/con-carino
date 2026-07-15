export type EffectiveRateInput = {
  personHourlyRate: number | string | null
  typeDefaultHourlyRate: number | string | null
  typeIsPaid: boolean
}

export type CarePayInterval = 'PER_SHIFT' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

export type PayScheduleInput = {
  payInterval: CarePayInterval
  payWeekday: number | null
  payAnchorDate: Date | null
  payMonthDay: number | null
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

/** Effective hourly rate for a care person, or null if unpaid / no rate. */
export function effectiveHourlyRate(input: EffectiveRateInput): number | null {
  if (!input.typeIsPaid) return null
  const override = toNumber(input.personHourlyRate)
  if (override !== null && override >= 0) return override
  const fallback = toNumber(input.typeDefaultHourlyRate)
  if (fallback !== null && fallback >= 0) return fallback
  return null
}

export function computeInvoiceAmount(
  hourlyRate: number,
  hours: number,
): { amount: number; hourlyRate: number; hours: number } {
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new Error('Hourly rate is invalid.')
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('Hours must be positive.')
  }
  const amount = Math.round(hourlyRate * hours * 10_000) / 10_000
  return { amount, hourlyRate, hours }
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetweenUtcMidnight(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const b0 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((b0 - a0) / 86_400_000)
}

/**
 * End of the most recently closed pay period as of `now`.
 * Accrued shifts with endsAt <= this cutoff are eligible to invoice.
 * Returns null when schedule config is incomplete.
 */
export function lastClosedPayPeriodEnd(
  schedule: PayScheduleInput,
  now: Date = new Date(),
): Date | null {
  switch (schedule.payInterval) {
    case 'PER_SHIFT':
      return now
    case 'WEEKLY': {
      if (
        schedule.payWeekday === null ||
        schedule.payWeekday < 0 ||
        schedule.payWeekday > 6
      ) {
        return null
      }
      const today = startOfLocalDay(now)
      const delta = (today.getDay() - schedule.payWeekday + 7) % 7
      const payday = new Date(today)
      payday.setDate(payday.getDate() - delta)
      // If today is payday but before end-of-day, still treat as closed for simplicity
      return endOfLocalDay(payday)
    }
    case 'BIWEEKLY': {
      if (
        schedule.payWeekday === null ||
        schedule.payWeekday < 0 ||
        schedule.payWeekday > 6 ||
        !schedule.payAnchorDate
      ) {
        return null
      }
      const today = startOfLocalDay(now)
      const delta = (today.getDay() - schedule.payWeekday + 7) % 7
      let candidate = new Date(today)
      candidate.setDate(candidate.getDate() - delta)
      const anchor = startOfLocalDay(schedule.payAnchorDate)
      // Walk back until aligned with anchor's biweekly cycle
      while (daysBetweenUtcMidnight(anchor, candidate) % 14 !== 0) {
        candidate.setDate(candidate.getDate() - 7)
      }
      if (candidate.getTime() > today.getTime()) {
        candidate.setDate(candidate.getDate() - 14)
      }
      return endOfLocalDay(candidate)
    }
    case 'MONTHLY': {
      if (
        schedule.payMonthDay === null ||
        schedule.payMonthDay < 1 ||
        schedule.payMonthDay > 28
      ) {
        return null
      }
      const today = startOfLocalDay(now)
      let year = today.getFullYear()
      let month = today.getMonth()
      if (today.getDate() < schedule.payMonthDay) {
        month -= 1
        if (month < 0) {
          month = 11
          year -= 1
        }
      }
      return endOfLocalDay(new Date(year, month, schedule.payMonthDay))
    }
    default:
      return null
  }
}

/** Inclusive period start for a closed period ending at `periodEnd`. */
export function payPeriodStart(
  schedule: PayScheduleInput,
  periodEnd: Date,
): Date {
  const endDay = startOfLocalDay(periodEnd)
  switch (schedule.payInterval) {
    case 'PER_SHIFT':
      return endDay
    case 'WEEKLY': {
      const start = new Date(endDay)
      start.setDate(start.getDate() - 6)
      return start
    }
    case 'BIWEEKLY': {
      const start = new Date(endDay)
      start.setDate(start.getDate() - 13)
      return start
    }
    case 'MONTHLY': {
      const start = new Date(endDay)
      start.setMonth(start.getMonth() - 1)
      start.setDate(start.getDate() + 1)
      return start
    }
    default:
      return endDay
  }
}
