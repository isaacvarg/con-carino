/**
 * Week and month windows for the simple pay overview.
 *
 * Pure and offset-based so the view can step backwards and forwards without the
 * server holding any cursor state — the offset lives in the URL and the range
 * is recomputed from it on every load.
 */

export type PayOverviewMode = 'WEEKLY' | 'MONTHLY'

export type PayOverviewRange = {
  mode: PayOverviewMode
  offset: number
  /** Local midnight at the start of the period. */
  start: Date
  /** Exclusive: local midnight at the start of the *next* period. */
  end: Date
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Weeks run Sunday–Saturday to match the `0=Sun … 6=Sat` convention used by
 * every other day-of-week field in the care domain.
 */
export function payOverviewRange(
  mode: PayOverviewMode,
  offset: number,
  now: Date = new Date(),
): PayOverviewRange {
  const today = startOfLocalDay(now)

  if (mode === 'WEEKLY') {
    const start = new Date(today)
    start.setDate(start.getDate() - start.getDay() + offset * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { mode, offset, start, end }
  }

  // setMonth normalises overflow, so offset -14 or +30 lands correctly and a
  // month-end "today" cannot roll into the following month (day is forced to 1
  // before the month is changed).
  const start = new Date(today)
  start.setDate(1)
  start.setMonth(start.getMonth() + offset)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { mode, offset, start, end }
}

/**
 * Human label for the period. Weeks name their endpoints; months name
 * themselves. The year is only shown when it is not the current one, so the
 * common case stays short.
 */
export function payOverviewLabel(
  range: PayOverviewRange,
  now: Date = new Date(),
): string {
  const lastDay = new Date(range.end)
  lastDay.setDate(lastDay.getDate() - 1)
  const sameYear = range.start.getFullYear() === now.getFullYear()

  if (range.mode === 'MONTHLY') {
    return range.start.toLocaleDateString('en-US', {
      month: 'long',
      year: sameYear ? undefined : 'numeric',
    })
  }

  const startLabel = range.start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = lastDay.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
  return `${startLabel} – ${endLabel}`
}
