/**
 * Which day a displayed week starts on, and the week labels derived from it.
 *
 * Two rules keep this safe to change at any time:
 *
 * 1. A week is identified by the **local date of its first day**, as a
 *    `YYYY-MM-DD` string — never by a week *number*. Week numbering depends on
 *    the anchor, so a stored number would silently change meaning the moment the
 *    household switched from Sunday to Monday. A start date does not.
 * 2. This is a *display* choice. It must never be used to reinterpret a stored
 *    `0=Sun … 6=Sat` value (coverage days, pay weekdays, recurrence rules) —
 *    those keep meaning what they always meant.
 */

/** 0=Sun or 1=Mon, matching `Date#getDay()`. */
export type WeekStart = 0 | 1

export const WEEK_STARTS = [0, 1] as const

export const DEFAULT_WEEK_START: WeekStart = 0

export function isWeekStart(value: unknown): value is WeekStart {
  return value === 0 || value === 1
}

/** Coerces anything unrecognised to the default rather than throwing. */
export function toWeekStart(value: unknown): WeekStart {
  return isWeekStart(value) ? value : DEFAULT_WEEK_START
}

export const WEEK_START_LABELS: Record<WeekStart, string> = {
  0: 'Sunday',
  1: 'Monday',
}

/**
 * Indexed by `Date#getDay()`, so this stays Sunday-first no matter where the
 * household's week starts — `DAY_NAMES[storedDayOfWeek]` is a lookup, not a
 * display order. To render days in display order, map over
 * `orderedDayIndices(weekStartsOn)` and index into this.
 */
export const DAY_NAMES = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Local midnight on the first day of the week containing `date`.
 *
 * The `+ 7` before the modulo is what makes Monday-anchored Sundays work: a
 * Sunday under `weekStartsOn = 1` is `0 - 1 = -1`, which has to wrap to 6 (the
 * *previous* Monday) rather than staying negative.
 */
export function startOfWeek(date: Date, weekStartsOn: WeekStart): Date {
  const start = startOfLocalDay(date)
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7))
  return start
}

/** Local midnight on the first day of the week `offset` weeks away. */
export function addWeeks(start: Date, offset: number): Date {
  const next = new Date(start)
  next.setDate(next.getDate() + offset * 7)
  return next
}

/**
 * Day-of-week indices in display order: `[0..6]` for Sunday, `[1..6, 0]` for
 * Monday.
 *
 * Callers render `DAY_NAMES[dow]` from these. That indirection is the whole
 * point — the label table stays Sunday-indexed so `DAY_NAMES[someStoredDay]`
 * keeps working, and only the *iteration order* changes.
 */
export function orderedDayIndices(weekStartsOn: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)
}

/** Local `YYYY-MM-DD`. Deliberately not `toISOString`, which shifts to UTC. */
export function toYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(value: unknown): value is string {
  return typeof value === 'string' && YMD_RE.test(value)
}

/** Parses a local `YYYY-MM-DD` back to local midnight. Null when malformed. */
export function fromYmd(value: string): Date | null {
  if (!isYmd(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)
  // Rejects the likes of 2026-02-31, which the Date constructor happily rolls
  // forward into March.
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m! - 1 ||
    date.getDate() !== d
  ) {
    return null
  }
  return date
}

/** The stored identifier for the week containing `date`. */
export function weekStartYmd(date: Date, weekStartsOn: WeekStart): string {
  return toYmd(startOfWeek(date, weekStartsOn))
}

const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' }

/**
 * `Jan 04 - Jan 10 2026`, or `Dec 28 2025 - Jan 03 2026` when the week straddles
 * a year boundary — in which case both years are named, since one trailing year
 * would be wrong for half the range.
 *
 * Derived entirely from the stored start date, so a week filed under the old
 * anchor still reads correctly after the setting changes.
 */
export function weekLabelFromYmd(ymd: string): string {
  const start = fromYmd(ymd)
  if (!start) return ymd

  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const startLabel = start.toLocaleDateString('en-US', MONTH_DAY)
  const endLabel = end.toLocaleDateString('en-US', MONTH_DAY)

  if (start.getFullYear() !== end.getFullYear()) {
    return `${startLabel} ${start.getFullYear()} - ${endLabel} ${end.getFullYear()}`
  }
  return `${startLabel} - ${endLabel} ${end.getFullYear()}`
}

export type WeekOption = {
  /** Stored value: local `YYYY-MM-DD` of the week's first day. */
  value: string
  label: string
}

export function weekOption(ymd: string): WeekOption {
  return { value: ymd, label: weekLabelFromYmd(ymd) }
}

/**
 * A window of consecutive weeks around the one containing `anchor`, oldest
 * first, for the transaction picker.
 *
 * `pinned` keeps an already-filed week selectable even when it falls outside the
 * window or off the current anchor — the case that shows up right after the
 * household switches from Sunday to Monday.
 */
export function weekOptionsAround(
  anchor: Date,
  weekStartsOn: WeekStart,
  before: number,
  after: number,
  pinned?: string | null,
): WeekOption[] {
  const current = startOfWeek(anchor, weekStartsOn)
  const values: string[] = []
  for (let offset = -before; offset <= after; offset++) {
    values.push(toYmd(addWeeks(current, offset)))
  }

  if (pinned && isYmd(pinned) && !values.includes(pinned)) {
    values.push(pinned)
    values.sort()
  }

  return values.map(weekOption)
}
