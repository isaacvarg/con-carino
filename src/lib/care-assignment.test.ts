import { describe, expect, it } from 'vitest'
import {
  occurrenceMatchesRule,
  upcomingRuleDays,
  type AssignmentRuleShape,
} from '#/lib/care-assignment'

const NOW = new Date(2026, 6, 20, 8, 0, 0) // Mon Jul 20, 2026 08:00

function rule(overrides: Partial<AssignmentRuleShape> = {}): AssignmentRuleShape {
  return {
    daysOfWeek: [1], // Monday
    intervalWeeks: 1,
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

  // Week index is floor(daysBetween(startsOn, day) / 7) from startsOn (Jul 1, Wed).
  // Mondays: Jul 20 → index 2, Jul 27 → index 3, Aug 3 → index 4.
  it('intervalWeeks 1 fills every eligible week', () => {
    const r = rule({ intervalWeeks: 1 })
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 6, 20, 9, 0, 0)), NOW)).toBe(true)
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 6, 27, 9, 0, 0)), NOW)).toBe(true)
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 7, 3, 9, 0, 0)), NOW)).toBe(true)
  })

  it('intervalWeeks 2 fills only on-cadence weeks (even week index)', () => {
    const r = rule({ intervalWeeks: 2 })
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 6, 20, 9, 0, 0)), NOW)).toBe(true) // index 2
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 6, 27, 9, 0, 0)), NOW)).toBe(false) // index 3
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 7, 3, 9, 0, 0)), NOW)).toBe(true) // index 4
  })

  it('intervalWeeks 3 fills only every third week from startsOn', () => {
    const r = rule({ intervalWeeks: 3 })
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 6, 20, 9, 0, 0)), NOW)).toBe(false) // index 2
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 6, 27, 9, 0, 0)), NOW)).toBe(true) // index 3
    expect(occurrenceMatchesRule(r, occ(new Date(2026, 7, 17, 9, 0, 0)), NOW)).toBe(true) // index 6
  })

  it('SPECIFIC_SHIFTS matches only targeted shift ids', () => {
    const monday = new Date(2026, 6, 27, 9, 0, 0)
    const r = rule({ scope: 'SPECIFIC_SHIFTS', shiftIds: ['shift-a'] })
    expect(occurrenceMatchesRule(r, occ(monday, 'shift-a'), NOW)).toBe(true)
    expect(occurrenceMatchesRule(r, occ(monday, 'shift-b'), NOW)).toBe(false)
    expect(occurrenceMatchesRule(r, occ(monday, null), NOW)).toBe(false)
  })
})

describe('upcomingRuleDays', () => {
  const FROM = new Date(2026, 9, 8) // Thu Oct 8, 2026

  it('lists weekly days from the given date', () => {
    const days = upcomingRuleDays(
      rule({ daysOfWeek: [1], startsOn: new Date(2026, 0, 5) }),
      FROM,
      3,
    )
    expect(days.map((d) => d.getDate())).toEqual([12, 19, 26])
  })

  it('anchors every-4-weeks rotations at the start date', () => {
    // Mon Oct 12 is week 0 of the rotation; next turns are Nov 9 and Dec 7.
    const days = upcomingRuleDays(
      rule({ daysOfWeek: [1], intervalWeeks: 4, startsOn: new Date(2026, 9, 12) }),
      FROM,
      3,
    )
    expect(days.map((d) => [d.getMonth(), d.getDate()])).toEqual([
      [9, 12],
      [10, 9],
      [11, 7],
    ])
  })

  it('offsets rotations by their start week so four people can share one slot', () => {
    const turns = [0, 1, 2, 3].map(
      (week) =>
        upcomingRuleDays(
          rule({
            daysOfWeek: [1],
            intervalWeeks: 4,
            startsOn: new Date(2026, 9, 12 + 7 * week),
          }),
          FROM,
          1,
        )[0],
    )
    expect(turns.map((d) => d.getTime())).toEqual(
      [12, 19, 26, 33].map((d) => new Date(2026, 9, d).getTime()),
    )
  })

  it('stops at the end date', () => {
    const days = upcomingRuleDays(
      rule({ daysOfWeek: [1], startsOn: new Date(2026, 0, 5), endsOn: new Date(2026, 9, 20) }),
      FROM,
      5,
    )
    expect(days.map((d) => d.getDate())).toEqual([12, 19])
  })

  it('returns nothing without days', () => {
    expect(upcomingRuleDays(rule({ daysOfWeek: [] }), FROM, 3)).toEqual([])
  })
})
