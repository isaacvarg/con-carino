export type CareAssignmentScope = 'ALL_SHIFTS' | 'SPECIFIC_SHIFTS'

export type AssignmentRuleShape = {
  /** Days of week 0=Sun … 6=Sat */
  daysOfWeek: number[]
  /** Local midnight of the rule's first eligible day */
  startsOn: Date
  /** Local midnight of the rule's last eligible day, inclusive; null = indefinite */
  endsOn: Date | null
  scope: CareAssignmentScope
  /** Targeted required-shift ids when scope is SPECIFIC_SHIFTS */
  shiftIds: string[]
}

export type OccurrenceShape = {
  startsAt: Date
  endsAt: Date
  /** requiredShiftId of the parent required series; null for all-day/manual */
  requiredShiftId: string | null
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Whether an open required occurrence falls within a rule's day-of-week, date
 * window, and shift scope. Occurrences that have already ended (relative to
 * `now`) never match — a rule only fills present/future slots.
 */
export function occurrenceMatchesRule(
  rule: AssignmentRuleShape,
  occ: OccurrenceShape,
  now: Date,
): boolean {
  if (occ.endsAt.getTime() <= now.getTime()) return false
  if (!rule.daysOfWeek.includes(occ.startsAt.getDay())) return false

  const day = startOfLocalDay(occ.startsAt)
  if (day.getTime() < rule.startsOn.getTime()) return false
  if (rule.endsOn && day.getTime() > rule.endsOn.getTime()) return false

  if (rule.scope === 'SPECIFIC_SHIFTS') {
    if (!occ.requiredShiftId) return false
    if (!rule.shiftIds.includes(occ.requiredShiftId)) return false
  }
  return true
}
