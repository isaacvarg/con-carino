export type CareCoverageNeed = 'FULL' | 'PARTIAL'
export type CareCoverageWindowKind = 'ALL_DAY' | 'SHIFTS'

export type RequiredShiftInput = {
  id: string
  label: string | null
  startTime: string
  endTime: string
  sortOrder: number
}

export type RequiredCoverageWindow = {
  requiredKey: string
  /** Stable CareRequiredShift id for SHIFTS windows; null for ALL_DAY. */
  requiredShiftId: string | null
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
          requiredShiftId: null,
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
    requiredShiftId: shift.id,
    startTime: shift.startTime,
    endTime: shift.endTime,
    notes: shift.label?.trim()
      ? `Required: ${shift.label.trim()}`
      : 'Required coverage',
  }))

  return { daysOfWeek, windows }
}

/** Soft check: whether shift intervals cover every minute of a local day. */
export function shiftsCoverFullDay(
  shifts: Array<{ startTime: string; endTime: string }>,
): boolean {
  if (shifts.length === 0) return false
  const DAY = 24 * 60
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN
    return h! * 60 + m!
  }
  type Interval = { start: number; end: number }
  const intervals: Interval[] = []
  for (const shift of shifts) {
    const start = minutes(shift.startTime)
    const end = minutes(shift.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    if (start === end) {
      // Identical start/end means a full 24h window.
      return true
    }
    if (end > start) {
      intervals.push({ start, end })
    } else {
      // Overnight wraps past midnight: cover evening and early morning.
      intervals.push({ start, end: DAY })
      intervals.push({ start: 0, end })
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end)
  let covered = 0
  for (const iv of intervals) {
    if (iv.start > covered) return false
    covered = Math.max(covered, iv.end)
    if (covered >= DAY) return true
  }
  return covered >= DAY
}
