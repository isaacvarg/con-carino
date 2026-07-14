export type CareCoverageNeed = 'FULL' | 'PARTIAL'
export type CareCoverageWindowKind = 'ALL_DAY' | 'SHIFTS'

export type RequiredShiftInput = {
  label: string | null
  startTime: string
  endTime: string
  sortOrder: number
}

export type RequiredCoverageWindow = {
  requiredKey: string
  startTime: string
  endTime: string
  notes: string | null
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

export function effectiveCoverageDays(
  need: CareCoverageNeed,
  partialDaysOfWeek: number[],
): number[] {
  if (need === 'FULL') return [...ALL_DAYS]
  return [...new Set(partialDaysOfWeek)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
}

/**
 * Build weekly open-slot templates from loved-one coverage settings.
 * All-day uses 00:00–00:00 (overnight = 24h) via existing recurrence expand.
 */
export function buildRequiredCoverageWindows(input: {
  coverageNeed: CareCoverageNeed
  coverageWindowKind: CareCoverageWindowKind
  partialDaysOfWeek: number[]
  shifts: RequiredShiftInput[]
}): { daysOfWeek: number[]; windows: RequiredCoverageWindow[] } {
  const daysOfWeek = effectiveCoverageDays(
    input.coverageNeed,
    input.partialDaysOfWeek,
  )
  if (daysOfWeek.length === 0) {
    return { daysOfWeek, windows: [] }
  }

  if (input.coverageWindowKind === 'ALL_DAY') {
    return {
      daysOfWeek,
      windows: [
        {
          requiredKey: 'required:all-day',
          startTime: '00:00',
          endTime: '00:00',
          notes: 'Required coverage (all day)',
        },
      ],
    }
  }

  const sorted = [...input.shifts].sort((a, b) => a.sortOrder - b.sortOrder)
  const windows = sorted.map((shift, index) => ({
    requiredKey: `required:shift:${index}:${shift.startTime}-${shift.endTime}`,
    startTime: shift.startTime,
    endTime: shift.endTime,
    notes: shift.label?.trim()
      ? `Required: ${shift.label.trim()}`
      : 'Required coverage',
  }))

  return { daysOfWeek, windows }
}

/** Soft check: whether shift intervals cover a full local day (allows gaps across midnight). */
export function shiftsCoverFullDay(
  shifts: Array<{ startTime: string; endTime: string }>,
): boolean {
  if (shifts.length === 0) return false
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h! * 60 + m!
  }
  type Interval = { start: number; end: number }
  const intervals: Interval[] = []
  for (const shift of shifts) {
    const start = minutes(shift.startTime)
    let end = minutes(shift.endTime)
    if (end <= start) end += 24 * 60
    intervals.push({ start, end })
  }
  intervals.sort((a, b) => a.start - b.start)
  let covered = 0
  let cursor = 0
  for (const iv of intervals) {
    if (iv.start > cursor) return false
    covered = Math.max(covered, iv.end)
    cursor = covered
    if (covered >= 24 * 60) return true
  }
  return covered >= 24 * 60
}
