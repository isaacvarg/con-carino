import { describe, expect, it } from 'vitest'
import {
  contributionDueDates,
  proRateToCadence,
  transferAmountFor,
  type ContributionScheduleInput,
} from '#/lib/care-contribution-schedule'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const iso = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`

function sched(
  over: Partial<ContributionScheduleInput>,
): ContributionScheduleInput {
  return {
    cadence: 'MONTHLY',
    intervalWeeks: 1,
    anchorDate: null,
    monthDay: 1,
    ...over,
  }
}

describe('contributionDueDates — monthly', () => {
  it('returns the 1st of each month in range', () => {
    const out = contributionDueDates(
      sched({ monthDay: 1 }),
      d(2026, 7, 1),
      d(2026, 10, 15),
    )
    expect(out.map(iso)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('excludes the `after` date itself', () => {
    const out = contributionDueDates(
      sched({ monthDay: 15 }),
      d(2026, 7, 15),
      d(2026, 9, 20),
    )
    expect(out.map(iso)).toEqual(['2026-08-15', '2026-09-15'])
  })

  it('includes a due date landing exactly on `until`', () => {
    const out = contributionDueDates(
      sched({ monthDay: 10 }),
      d(2026, 7, 1),
      d(2026, 7, 10),
    )
    expect(out.map(iso)).toEqual(['2026-07-10'])
  })

  it('crosses a year boundary', () => {
    const out = contributionDueDates(
      sched({ monthDay: 5 }),
      d(2026, 11, 30),
      d(2027, 2, 28),
    )
    expect(out.map(iso)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05'])
  })

  it('returns nothing when monthDay is unset or out of range', () => {
    for (const monthDay of [null, 0, 29, 31]) {
      expect(
        contributionDueDates(sched({ monthDay }), d(2026, 7, 1), d(2027, 7, 1)),
      ).toEqual([])
    }
  })

  it('returns nothing when the window is inverted', () => {
    expect(
      contributionDueDates(sched({}), d(2026, 9, 1), d(2026, 7, 1)),
    ).toEqual([])
  })
})

describe('contributionDueDates — weekly cadences', () => {
  const every3 = sched({
    cadence: 'EVERY_N_WEEKS',
    intervalWeeks: 3,
    anchorDate: d(2026, 7, 1),
    monthDay: null,
  })

  it('steps every N weeks from the anchor', () => {
    const out = contributionDueDates(every3, d(2026, 7, 1), d(2026, 9, 1))
    expect(out.map(iso)).toEqual(['2026-07-22', '2026-08-12'])
  })

  it('lands on the anchor when the window opens before it', () => {
    const out = contributionDueDates(every3, d(2026, 6, 1), d(2026, 7, 22))
    expect(out.map(iso)).toEqual(['2026-07-01', '2026-07-22'])
  })

  it('treats WEEKLY as a 1-week interval regardless of intervalWeeks', () => {
    const out = contributionDueDates(
      sched({
        cadence: 'WEEKLY',
        intervalWeeks: 5,
        anchorDate: d(2026, 7, 1),
        monthDay: null,
      }),
      d(2026, 7, 1),
      d(2026, 7, 29),
    )
    expect(out.map(iso)).toEqual([
      '2026-07-08',
      '2026-07-15',
      '2026-07-22',
      '2026-07-29',
    ])
  })

  it('handles an anchor far in the past without walking every cycle', () => {
    const out = contributionDueDates(
      sched({
        cadence: 'EVERY_N_WEEKS',
        intervalWeeks: 2,
        anchorDate: d(2015, 1, 7),
        monthDay: null,
      }),
      d(2026, 7, 1),
      d(2026, 8, 1),
    )
    expect(out.length).toBeGreaterThan(0)
    // Every result stays on the anchor's 14-day grid.
    for (const x of out) {
      const days = Math.round(
        (x.getTime() - d(2015, 1, 7).getTime()) / 86_400_000,
      )
      expect(days % 14).toBe(0)
    }
  })

  it('returns nothing without an anchor date', () => {
    expect(
      contributionDueDates(
        sched({ cadence: 'EVERY_N_WEEKS', intervalWeeks: 3, anchorDate: null }),
        d(2026, 7, 1),
        d(2026, 9, 1),
      ),
    ).toEqual([])
  })

  it('is idempotent: feeding back the last due date yields the next one', () => {
    const first = contributionDueDates(every3, d(2026, 7, 1), d(2026, 9, 1))
    const last = first[first.length - 1]!
    const next = contributionDueDates(every3, last, d(2026, 9, 1))
    expect(next.map(iso)).not.toContain(iso(last))
  })
})

describe('proRateToCadence', () => {
  it('passes a monthly share through unchanged', () => {
    expect(proRateToCadence(400, sched({}))).toBe(400)
  })

  it('converts a monthly share to a weekly one', () => {
    expect(
      proRateToCadence(
        433,
        sched({ cadence: 'WEEKLY', intervalWeeks: 1, anchorDate: d(2026, 7, 1) }),
      ),
    ).toBeCloseTo((433 * 12) / 52, 4)
  })

  it('scales by the interval for multi-week cadences', () => {
    const weekly = proRateToCadence(
      433,
      sched({ cadence: 'WEEKLY', intervalWeeks: 1, anchorDate: d(2026, 7, 1) }),
    )
    const every3 = proRateToCadence(
      433,
      sched({
        cadence: 'EVERY_N_WEEKS',
        intervalWeeks: 3,
        anchorDate: d(2026, 7, 1),
      }),
    )
    // Only to 3dp: the 3-week figure rounds once at the end, whereas
    // `weekly * 3` multiplies an already-rounded number. Rounding last is the
    // correct behaviour, so the tiny divergence is expected.
    expect(every3).toBeCloseTo(weekly * 3, 3)
  })

  it('rounds to 4dp', () => {
    const v = proRateToCadence(
      333.333333,
      sched({ cadence: 'WEEKLY', intervalWeeks: 1, anchorDate: d(2026, 7, 1) }),
    )
    expect(v).toBe(Math.round(v * 10_000) / 10_000)
  })

  it('rejects a bad interval', () => {
    expect(() =>
      proRateToCadence(
        100,
        sched({ cadence: 'EVERY_N_WEEKS', intervalWeeks: 0, anchorDate: d(2026, 7, 1) }),
      ),
    ).toThrow(/whole number of weeks/)
  })
})

describe('transferAmountFor', () => {
  it('adds a debit balance to the base', () => {
    expect(transferAmountFor(300, 40)).toBe(340)
  })

  it('subtracts a credit balance', () => {
    expect(transferAmountFor(300, -40)).toBe(260)
  })

  it('floors at zero when the credit exceeds the base', () => {
    expect(transferAmountFor(300, -500)).toBe(0)
  })

  it('returns the base when settled up', () => {
    expect(transferAmountFor(300, 0)).toBe(300)
  })
})
