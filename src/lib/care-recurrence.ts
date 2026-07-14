export type CareCoverageFrequency = 'WEEKLY' | 'BIWEEKLY'

export type SeriesRule = {
  startsOn: Date
  endsOn: Date | null
  startTime: string
  endTime: string
  frequency: CareCoverageFrequency
  daysOfWeek: number[]
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseHhMm(value: string): { hours: number; minutes: number } {
  const trimmed = value.trim()
  const match = TIME_RE.exec(trimmed)
  if (!match) {
    throw new Error('Time must be HH:mm (24-hour).')
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

/** Build a Date in local time from a calendar date + HH:mm. */
export function combineLocalDateAndTime(date: Date, time: string): Date {
  const { hours, minutes } = parseHhMm(time)
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  )
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Expand a coverage series into occurrence start/end pairs within [rangeStart, rangeEnd].
 * BIWEEKLY uses 14-day buckets from `startsOn` (week-of-series origin).
 */
export function expandSeriesOccurrences(
  rule: SeriesRule,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ startsAt: Date; endsAt: Date }> {
  const days = [...new Set(rule.daysOfWeek)].filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6,
  )
  if (days.length === 0) {
    throw new Error('At least one day of week is required.')
  }

  const seriesStart = startOfLocalDay(rule.startsOn)
  const seriesEnd = rule.endsOn ? startOfLocalDay(rule.endsOn) : null
  const windowStart = startOfLocalDay(rangeStart)
  const windowEnd = startOfLocalDay(rangeEnd)

  const cursorStart =
    windowStart.getTime() > seriesStart.getTime() ? windowStart : seriesStart
  let cursorEnd = windowEnd
  if (seriesEnd && seriesEnd.getTime() < cursorEnd.getTime()) {
    cursorEnd = seriesEnd
  }
  if (cursorStart.getTime() > cursorEnd.getTime()) {
    return []
  }

  const results: Array<{ startsAt: Date; endsAt: Date }> = []
  for (
    let day = cursorStart;
    day.getTime() <= cursorEnd.getTime();
    day = addDays(day, 1)
  ) {
    const dow = day.getDay()
    if (!days.includes(dow)) continue

    if (rule.frequency === 'BIWEEKLY') {
      const offset = daysBetween(seriesStart, day)
      const weekIndex = Math.floor(offset / 7)
      if (weekIndex % 2 !== 0) continue
    }

    const startsAt = combineLocalDateAndTime(day, rule.startTime)
    let endsAt = combineLocalDateAndTime(day, rule.endTime)
    if (endsAt.getTime() <= startsAt.getTime()) {
      // Overnight shift
      endsAt = addDays(endsAt, 1)
    }

    if (endsAt.getTime() < rangeStart.getTime()) continue
    if (startsAt.getTime() > rangeEnd.getTime()) continue

    results.push({ startsAt, endsAt })
  }

  return results
}

export function hoursBetween(startsAt: Date, endsAt: Date): number {
  const ms = endsAt.getTime() - startsAt.getTime()
  if (ms <= 0) {
    throw new Error('End must be after start.')
  }
  return ms / 3_600_000
}
