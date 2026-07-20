import { describe, expect, it } from 'vitest'
import {
  occurrenceMatchesRule,
  type AssignmentRuleShape,
} from '#/lib/care-assignment'

const NOW = new Date(2026, 6, 20, 8, 0, 0) // Mon Jul 20, 2026 08:00

function rule(overrides: Partial<AssignmentRuleShape> = {}): AssignmentRuleShape {
  return {
    daysOfWeek: [1], // Monday
    startsOn: new Date(2026, 6, 1),
    endsOn: null,
    scope: 'ALL_SHIFTS',
    shiftIds: [],
    ...overrides,
  }
}

// A future Monday occurrence, morning shift
function occ(startsAt: Date, requiredShiftId: string | null = null) {
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
    requiredShiftId,
  }
}

describe('occurrenceMatchesRule', () => {
  it('matches an open slot on an included weekday within the window', () => {
    const monday = new Date(2026, 6, 27, 9, 0, 0)
    expect(occurrenceMatchesRule(rule(), occ(monday), NOW)).toBe(true)
  })

  it('rejects a weekday not in the rule', () => {
    const tuesday = new Date(2026, 6, 28, 9, 0, 0)
    expect(occurrenceMatchesRule(rule(), occ(tuesday), NOW)).toBe(false)
  })

  it('rejects occurrences that have already ended', () => {
    const pastMonday = new Date(2026, 6, 13, 6, 0, 0) // ended before NOW
    expect(occurrenceMatchesRule(rule(), occ(pastMonday), NOW)).toBe(false)
  })

  it('rejects days before startsOn', () => {
    const earlyMonday = new Date(2026, 5, 22, 9, 0, 0) // Jun 22, before Jul 1
    expect(
      occurrenceMatchesRule(rule({ startsOn: new Date(2026, 6, 1) }), occ(earlyMonday), NOW),
    ).toBe(false)
  })

  it('includes the whole endsOn day and rejects after it', () => {
    const onEnd = new Date(2026, 6, 27, 9, 0, 0)
    const afterEnd = new Date(2026, 7, 3, 9, 0, 0)
    const r = rule({ endsOn: new Date(2026, 6, 27) })
    expect(occurrenceMatchesRule(r, occ(onEnd), NOW)).toBe(true)
    expect(occurrenceMatchesRule(r, occ(afterEnd), NOW)).toBe(false)
  })

  it('SPECIFIC_SHIFTS matches only targeted shift ids', () => {
    const monday = new Date(2026, 6, 27, 9, 0, 0)
    const r = rule({ scope: 'SPECIFIC_SHIFTS', shiftIds: ['shift-a'] })
    expect(occurrenceMatchesRule(r, occ(monday, 'shift-a'), NOW)).toBe(true)
    expect(occurrenceMatchesRule(r, occ(monday, 'shift-b'), NOW)).toBe(false)
    expect(occurrenceMatchesRule(r, occ(monday, null), NOW)).toBe(false)
  })
})
