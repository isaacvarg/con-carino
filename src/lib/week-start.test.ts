import { describe, expect, it } from 'vitest'
import {
  fromYmd,
  orderedDayIndices,
  startOfWeek,
  toWeekStart,
  toYmd,
  weekLabelFromYmd,
  weekOptionsAround,
  weekStartYmd,
} from '#/lib/week-start'

// 2026-07-28 is a Tuesday. Sunday-anchored its week starts 2026-07-26;
// Monday-anchored it starts 2026-07-27.
const tuesday = new Date(2026, 6, 28, 14, 30)

describe('startOfWeek', () => {
  it('walks back to the Sunday when anchored on Sunday', () => {
    expect(toYmd(startOfWeek(tuesday, 0))).toBe('2026-07-26')
  })

  it('walks back to the Monday when anchored on Monday', () => {
    expect(toYmd(startOfWeek(tuesday, 1))).toBe('2026-07-27')
  })

  it('treats the anchor day as the first day of its own week', () => {
    const sunday = new Date(2026, 6, 26, 9)
    expect(toYmd(startOfWeek(sunday, 0))).toBe('2026-07-26')
    const monday = new Date(2026, 6, 27, 9)
    expect(toYmd(startOfWeek(monday, 1))).toBe('2026-07-27')
  })

  it('puts a Sunday in the previous week when anchored on Monday', () => {
    // The wrap-around case: 0 - 1 must land on the Monday six days back, not
    // stay negative and roll the date forward.
    const sunday = new Date(2026, 6, 26, 9)
    expect(toYmd(startOfWeek(sunday, 1))).toBe('2026-07-20')
  })

  it('anchors to local midnight regardless of the time of day', () => {
    const start = startOfWeek(tuesday, 0)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it('crosses a year boundary going back', () => {
    const friday = new Date(2026, 0, 2, 12) // 2026-01-02
    expect(toYmd(startOfWeek(friday, 0))).toBe('2025-12-28')
    expect(toYmd(startOfWeek(friday, 1))).toBe('2025-12-29')
  })

  it('stays on local midnight across a DST transition', () => {
    // US DST begins Sun 2026-03-08. Local-midnight arithmetic must not drift an
    // hour and land on the previous day.
    const wednesday = new Date(2026, 2, 11, 3)
    const start = startOfWeek(wednesday, 0)
    expect(toYmd(start)).toBe('2026-03-08')
    expect(start.getHours()).toBe(0)
  })
})

describe('orderedDayIndices', () => {
  it('runs Sunday-first when anchored on Sunday', () => {
    expect(orderedDayIndices(0)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('runs Monday-first with Sunday last when anchored on Monday', () => {
    expect(orderedDayIndices(1)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('is a permutation of all seven days either way', () => {
    for (const anchor of [0, 1] as const) {
      expect([...orderedDayIndices(anchor)].sort()).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ])
    }
  })
})

describe('weekStartYmd', () => {
  it('identifies a week by its first local day', () => {
    expect(weekStartYmd(tuesday, 0)).toBe('2026-07-26')
    expect(weekStartYmd(tuesday, 1)).toBe('2026-07-27')
  })
})

describe('fromYmd', () => {
  it('round-trips through toYmd', () => {
    expect(toYmd(fromYmd('2026-07-26')!)).toBe('2026-07-26')
  })

  it('parses to local midnight, not UTC', () => {
    const parsed = fromYmd('2026-07-26')!
    expect(parsed.getDate()).toBe(26)
    expect(parsed.getHours()).toBe(0)
  })

  it('rejects malformed and impossible dates', () => {
    expect(fromYmd('not-a-date')).toBeNull()
    expect(fromYmd('2026-7-26')).toBeNull()
    // The Date constructor would roll this into March rather than reject it.
    expect(fromYmd('2026-02-31')).toBeNull()
  })
})

describe('weekLabelFromYmd', () => {
  it('names both endpoints with one trailing year', () => {
    expect(weekLabelFromYmd('2026-07-26')).toBe('Jul 26 - Aug 01 2026')
  })

  it('zero-pads single-digit days', () => {
    expect(weekLabelFromYmd('2026-01-04')).toBe('Jan 04 - Jan 10 2026')
  })

  it('names both years when the week straddles a year boundary', () => {
    expect(weekLabelFromYmd('2025-12-28')).toBe('Dec 28 2025 - Jan 03 2026')
  })

  it('falls back to the raw value rather than throwing on garbage', () => {
    expect(weekLabelFromYmd('nonsense')).toBe('nonsense')
  })
})

describe('weekOptionsAround', () => {
  it('returns before + after + 1 consecutive weeks, oldest first', () => {
    const options = weekOptionsAround(tuesday, 0, 2, 2)
    expect(options.map((o) => o.value)).toEqual([
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
      '2026-08-02',
      '2026-08-09',
    ])
  })

  it('crosses a year boundary without gaps', () => {
    const jan = new Date(2026, 0, 6, 12) // Tuesday 2026-01-06
    const options = weekOptionsAround(jan, 0, 2, 0)
    expect(options.map((o) => o.value)).toEqual([
      '2025-12-21',
      '2025-12-28',
      '2026-01-04',
    ])
  })

  it('pins an already-filed week that falls outside the window', () => {
    const options = weekOptionsAround(tuesday, 0, 1, 1, '2025-03-02')
    expect(options[0]!.value).toBe('2025-03-02')
    expect(options).toHaveLength(4)
  })

  it('pins a week left over from the other anchor', () => {
    // Filed while the household was Sunday-anchored, now read Monday-anchored:
    // the value is not in the generated list and must still be selectable.
    const options = weekOptionsAround(tuesday, 1, 1, 1, '2026-07-26')
    expect(options.map((o) => o.value)).toEqual([
      '2026-07-20',
      '2026-07-26',
      '2026-07-27',
      '2026-08-03',
    ])
  })

  it('does not duplicate a pinned week already in the window', () => {
    const options = weekOptionsAround(tuesday, 0, 1, 1, '2026-07-26')
    expect(options).toHaveLength(3)
  })

  it('labels every option', () => {
    for (const option of weekOptionsAround(tuesday, 0, 1, 1)) {
      expect(option.label).toMatch(/^\w{3} \d{2} - \w{3} \d{2} \d{4}$/)
    }
  })
})

describe('toWeekStart', () => {
  it('passes through the two valid anchors', () => {
    expect(toWeekStart(0)).toBe(0)
    expect(toWeekStart(1)).toBe(1)
  })

  it('coerces anything else to Sunday rather than throwing', () => {
    expect(toWeekStart(6)).toBe(0)
    expect(toWeekStart(null)).toBe(0)
    expect(toWeekStart('1')).toBe(0)
  })
})
