import { combineLocalDateAndTime } from '#/lib/care-recurrence'
import { billableQuantity, computeInvoiceAmount } from '#/lib/care-invoice'
import type { CareRateType } from '#/lib/care-invoice'

export type RateBand = 'STANDARD' | 'OFF_SCHEDULE'

export type StandardSchedule = {
  /** 0=Sun … 6=Sat. Empty means no schedule is configured. */
  daysOfWeek: number[]
  /** Local wall time "HH:mm". Both null = the whole of a standard day counts. */
  startTime: string | null
  endTime: string | null
}

export type SegmentationInput = {
  startsAt: Date
  endsAt: Date
  schedule: StandardSchedule
  rateType: CareRateType
  flatDaily: boolean
  standardRate: number
  /** null = no premium configured; the whole window prices as STANDARD. */
  offScheduleRate: number | null
}

export type PricedSegment = {
  startsAt: Date
  endsAt: Date
  band: RateBand
  rate: number
  /** Hours (HOURLY), days (DAILY non-flat), or exactly 1 (flat daily). */
  quantity: number
  amount: number
}

type Interval = { start: number; end: number }

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function normalizeDays(daysOfWeek: number[]): Set<number> {
  return new Set(
    daysOfWeek.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  )
}

/**
 * Local-time intervals during which the person is on their typical schedule,
 * clipped to [windowStart, windowEnd) and merged.
 *
 * Iteration starts one day *before* the window: a standard window written as
 * 22:00–06:00 belongs to the day it starts on and reaches into the next, so a
 * window beginning at 00:30 can still be covered by the previous day's rule.
 */
function buildStandardMask(
  schedule: StandardSchedule,
  windowStart: Date,
  windowEnd: Date,
): Interval[] {
  const days = normalizeDays(schedule.daysOfWeek)
  if (days.size === 0) return []

  const raw: Interval[] = []
  const firstDay = addDays(startOfLocalDay(windowStart), -1)
  const lastDay = startOfLocalDay(windowEnd)

  for (
    let day = firstDay;
    day.getTime() <= lastDay.getTime();
    day = addDays(day, 1)
  ) {
    if (!days.has(day.getDay())) continue

    let start: Date
    let end: Date
    if (schedule.startTime === null || schedule.endTime === null) {
      // Whole calendar day is standard.
      start = day
      end = addDays(day, 1)
    } else {
      start = combineLocalDateAndTime(day, schedule.startTime)
      end = combineLocalDateAndTime(day, schedule.endTime)
      if (end.getTime() <= start.getTime()) {
        // Overnight standard window, e.g. 22:00–06:00.
        end = addDays(end, 1)
      }
    }
    raw.push({ start: start.getTime(), end: end.getTime() })
  }

  return clipAndMerge(raw, windowStart.getTime(), windowEnd.getTime())
}

function clipAndMerge(
  intervals: Interval[],
  lo: number,
  hi: number,
): Interval[] {
  const clipped = intervals
    .map((i) => ({ start: Math.max(i.start, lo), end: Math.min(i.end, hi) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)

  const merged: Interval[] = []
  for (const interval of clipped) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

function maskContains(mask: Interval[], t: number): boolean {
  return mask.some((i) => t >= i.start && t < i.end)
}

/** Total milliseconds of [lo, hi) that fall inside the mask. */
function maskOverlapMs(mask: Interval[], lo: number, hi: number): number {
  let total = 0
  for (const i of mask) {
    const start = Math.max(i.start, lo)
    const end = Math.min(i.end, hi)
    if (end > start) total += end - start
  }
  return total
}

function priceSegments(
  bounds: Array<{ startsAt: Date; endsAt: Date; band: RateBand; quantity: number }>,
  standardRate: number,
  offScheduleRate: number,
): PricedSegment[] {
  return bounds.map((seg) => {
    const rate = seg.band === 'OFF_SCHEDULE' ? offScheduleRate : standardRate
    const computed = computeInvoiceAmount(rate, seg.quantity)
    return {
      startsAt: seg.startsAt,
      endsAt: seg.endsAt,
      band: seg.band,
      rate,
      quantity: computed.hours,
      amount: computed.amount,
    }
  })
}

function wholeWindowStandard(input: SegmentationInput): PricedSegment[] {
  const quantity = billableQuantity(
    input.startsAt,
    input.endsAt,
    input.rateType,
    input.flatDaily,
  )
  return priceSegments(
    [
      {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        band: 'STANDARD',
        quantity,
      },
    ],
    input.standardRate,
    input.standardRate,
  )
}

/**
 * Split a coverage window at the boundaries of the assignee's typical schedule
 * and price each part at the band that applies to it.
 *
 * Flat-daily is the one case that cannot split exactly: a flat day is
 * indivisible by definition, so each calendar day is assigned wholly to
 * whichever band covers more of it (ties go to STANDARD). A day that is 60%
 * standard therefore bills a full standard day.
 *
 * Quantities are additive with the unsegmented calculation: for non-flat rates
 * the segment quantities sum to `billableQuantity` over the whole window, and
 * for flat daily they sum to `calendarDaysSpanned`.
 */
export function segmentCoverageWindow(
  input: SegmentationInput,
): PricedSegment[] {
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new Error('End must be after start.')
  }

  // No premium or no schedule configured: identical to the pre-segmentation
  // calculation, which is what keeps existing invoices reproducible.
  if (
    input.offScheduleRate === null ||
    normalizeDays(input.schedule.daysOfWeek).size === 0
  ) {
    return wholeWindowStandard(input)
  }

  const windowStartMs = input.startsAt.getTime()
  const windowEndMs = input.endsAt.getTime()
  const mask = buildStandardMask(input.schedule, input.startsAt, input.endsAt)

  if (input.rateType === 'DAILY' && input.flatDaily) {
    const segments: Array<{
      startsAt: Date
      endsAt: Date
      band: RateBand
      quantity: number
    }> = []

    // Same day set as calendarDaysSpanned: the end is exclusive, so a window
    // ending exactly at midnight does not add the following day.
    const lastMoment = new Date(Math.max(windowStartMs, windowEndMs - 1))
    let day = startOfLocalDay(input.startsAt)
    const lastDay = startOfLocalDay(lastMoment)

    while (day.getTime() <= lastDay.getTime()) {
      const dayStart = Math.max(day.getTime(), windowStartMs)
      const dayEnd = Math.min(addDays(day, 1).getTime(), windowEndMs)
      if (dayEnd > dayStart) {
        const standardMs = maskOverlapMs(mask, dayStart, dayEnd)
        const offMs = dayEnd - dayStart - standardMs
        segments.push({
          startsAt: new Date(dayStart),
          endsAt: new Date(dayEnd),
          band: standardMs >= offMs ? 'STANDARD' : 'OFF_SCHEDULE',
          quantity: 1,
        })
      }
      day = addDays(day, 1)
    }

    return priceSegments(segments, input.standardRate, input.offScheduleRate)
  }

  // HOURLY and DAILY non-flat: cut at every mask boundary inside the window.
  const cuts = new Set<number>([windowStartMs, windowEndMs])
  for (const interval of mask) {
    if (interval.start > windowStartMs && interval.start < windowEndMs) {
      cuts.add(interval.start)
    }
    if (interval.end > windowStartMs && interval.end < windowEndMs) {
      cuts.add(interval.end)
    }
  }
  const ordered = [...cuts].sort((a, b) => a - b)

  const runs: Array<{ start: number; end: number; band: RateBand }> = []
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const start = ordered[i]!
    const end = ordered[i + 1]!
    if (end <= start) continue
    const band: RateBand = maskContains(mask, (start + end) / 2)
      ? 'STANDARD'
      : 'OFF_SCHEDULE'
    const last = runs[runs.length - 1]
    if (last && last.band === band && last.end === start) {
      last.end = end
    } else {
      runs.push({ start, end, band })
    }
  }

  return priceSegments(
    runs.map((run) => ({
      startsAt: new Date(run.start),
      endsAt: new Date(run.end),
      band: run.band,
      quantity: billableQuantity(
        new Date(run.start),
        new Date(run.end),
        input.rateType,
        false,
      ),
    })),
    input.standardRate,
    input.offScheduleRate,
  )
}

/** Convenience: total of a segment list, rounded like an invoice amount. */
export function totalSegmentAmount(segments: PricedSegment[]): number {
  return Math.round(segments.reduce((s, x) => s + x.amount, 0) * 10_000) / 10_000
}
