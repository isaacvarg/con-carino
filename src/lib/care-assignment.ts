export type CareAssignmentScope = 'ALL_SHIFTS' | 'SPECIFIC_SHIFTS'

export type AssignmentRuleShape = {
  /** Days of week 0=Sun … 6=Sat */
  daysOfWeek: number[]
  /** Cadence in weeks: 1 = weekly, 2 = every other week, etc. Anchored at startsOn. */
  intervalWeeks: number
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

function daysBetween(a: Date, b: Date): number {
  const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Whether a calendar day is one the rule covers: right weekday, inside the
 * date window, and in an "on" week. Weeks are counted in 7-day blocks from
 * `startsOn`, so for every-N-weeks rules the start date picks which week of
 * the rotation is theirs.
 */
export function dayMatchesRuleCadence(
  rule: Pick<
    AssignmentRuleShape,
    'daysOfWeek' | 'intervalWeeks' | 'startsOn' | 'endsOn'
  >,
  date: Date,
): boolean {
  if (!rule.daysOfWeek.includes(date.getDay())) return false
  const day = startOfLocalDay(date)
  if (day.getTime() < rule.startsOn.getTime()) return false
  if (rule.endsOn && day.getTime() > rule.endsOn.getTime()) return false
  if (rule.intervalWeeks > 1) {
    const weekIndex = Math.floor(daysBetween(rule.startsOn, day) / 7)
    if (weekIndex % rule.intervalWeeks !== 0) return false
  }
  return true
}

/**
 * The next `count` days on or after `from` that a rule covers — a preview for
 * the edit form, so an admin can line rotations up before saving.
 */
export function upcomingRuleDays(
  rule: Pick<
    AssignmentRuleShape,
    'daysOfWeek' | 'intervalWeeks' | 'startsOn' | 'endsOn'
  >,
  from: Date,
  count: number,
): Date[] {
  const days: Date[] = []
  if (rule.daysOfWeek.length === 0 || count <= 0) return days
  const start = startOfLocalDay(from)
  // Long enough to find `count` hits at the sparsest cadence the UI offers.
  const horizon = 7 * Math.max(rule.intervalWeeks, 1) * (count + 1)
  for (let i = 0; i < horizon && days.length < count; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    if (rule.endsOn && day.getTime() > rule.endsOn.getTime()) break
    if (dayMatchesRuleCadence(rule, day)) days.push(day)
  }
  return days
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
  if (!dayMatchesRuleCadence(rule, occ.startsAt)) return false

  if (rule.scope === 'SPECIFIC_SHIFTS') {
    if (!occ.requiredShiftId) return false
    if (!rule.shiftIds.includes(occ.requiredShiftId)) return false
  }
  return true
}
