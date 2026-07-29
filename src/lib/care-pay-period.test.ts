import { describe, expect, it } from 'vitest'
import { payOverviewLabel, payOverviewRange } from '#/lib/care-pay-period'

// 2026-07-28 is a Tuesday; its week runs Sun 2026-07-26 → Sat 2026-08-01.
const tuesday = new Date(2026, 6, 28, 14, 30)

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

describe('payOverviewRange — weekly', () => {
  it('starts on the Sunday of the current week and ends the next Sunday', () => {
    const r = payOverviewRange('WEEKLY', 0, 0, tuesday)
    expect(ymd(r.start)).toBe('2026-07-26')
    expect(ymd(r.end)).toBe('2026-08-02')
    expect(r.start.getDay()).toBe(0)
  })

  it('anchors to local midnight regardless of the time of day', () => {
    const r = payOverviewRange('WEEKLY', 0, 0, tuesday)
    expect(r.start.getHours()).toBe(0)
    expect(r.start.getMinutes()).toBe(0)
    expect(r.start.getSeconds()).toBe(0)
    expect(r.start.getMilliseconds()).toBe(0)
  })

  it('treats a Sunday as the first day of its own week', () => {
    const sunday = new Date(2026, 6, 26, 9)
    expect(ymd(payOverviewRange('WEEKLY', 0, 0, sunday).start)).toBe(
      '2026-07-26',
    )
  })

  it('starts on Monday when the household anchors weeks there', () => {
    const r = payOverviewRange('WEEKLY', 0, 1, tuesday)
    expect(ymd(r.start)).toBe('2026-07-27')
    expect(ymd(r.end)).toBe('2026-08-03')
    expect(r.start.getDay()).toBe(1)
  })

  it('puts a Sunday in the previous week when anchored on Monday', () => {
    const sunday = new Date(2026, 6, 26, 9)
    expect(ymd(payOverviewRange('WEEKLY', 0, 1, sunday).start)).toBe(
      '2026-07-20',
    )
  })

  it('steps by whole weeks from a Monday anchor too', () => {
    expect(ymd(payOverviewRange('WEEKLY', -1, 1, tuesday).start)).toBe(
      '2026-07-20',
    )
    expect(ymd(payOverviewRange('WEEKLY', 1, 1, tuesday).start)).toBe(
      '2026-08-03',
    )
  })

  it('defaults to Sunday when no anchor is given', () => {
    expect(ymd(payOverviewRange('WEEKLY', 0, undefined, tuesday).start)).toBe(
      '2026-07-26',
    )
  })

  it('steps backwards and forwards by whole weeks', () => {
    expect(ymd(payOverviewRange('WEEKLY', -1, 0, tuesday).start)).toBe('2026-07-19')
    expect(ymd(payOverviewRange('WEEKLY', 1, 0, tuesday).start)).toBe('2026-08-02')
  })

  it('crosses a year boundary going back', () => {
    const jan = new Date(2026, 0, 2, 12) // Friday 2026-01-02
    const r = payOverviewRange('WEEKLY', -1, 0, jan)
    expect(ymd(r.start)).toBe('2025-12-21')
    expect(ymd(r.end)).toBe('2025-12-28')
  })

  it('always spans exactly seven days', () => {
    for (const offset of [-9, -1, 0, 1, 5, 30]) {
      const r = payOverviewRange('WEEKLY', offset, 0, tuesday)
      const days = Math.round(
        (r.end.getTime() - r.start.getTime()) / 86_400_000,
      )
      expect(days).toBe(7)
    }
  })
})

describe('payOverviewRange — monthly', () => {
  it('covers the calendar month containing today', () => {
    const r = payOverviewRange('MONTHLY', 0, 0, tuesday)
    expect(ymd(r.start)).toBe('2026-07-01')
    expect(ymd(r.end)).toBe('2026-08-01')
  })

  it('steps by whole months', () => {
    expect(ymd(payOverviewRange('MONTHLY', -1, 0, tuesday).start)).toBe(
      '2026-06-01',
    )
    expect(ymd(payOverviewRange('MONTHLY', 1, 0, tuesday).start)).toBe('2026-08-01')
  })

  it('does not skip February when stepping back from a 31st', () => {
    const march31 = new Date(2026, 2, 31, 8)
    const r = payOverviewRange('MONTHLY', -1, 0, march31)
    expect(ymd(r.start)).toBe('2026-02-01')
    expect(ymd(r.end)).toBe('2026-03-01')
  })

  it('handles February in a leap year', () => {
    const feb = new Date(2028, 1, 10, 8)
    const r = payOverviewRange('MONTHLY', 0, 0, feb)
    expect(ymd(r.start)).toBe('2028-02-01')
    expect(ymd(r.end)).toBe('2028-03-01')
  })

  it('crosses a year boundary in both directions', () => {
    const jan = new Date(2026, 0, 15, 8)
    expect(ymd(payOverviewRange('MONTHLY', -1, 0, jan).start)).toBe('2025-12-01')
    const dec = new Date(2026, 11, 15, 8)
    expect(ymd(payOverviewRange('MONTHLY', 1, 0, dec).start)).toBe('2027-01-01')
  })
})

describe('payOverviewLabel', () => {
  it('names both endpoints of a week', () => {
    const r = payOverviewRange('WEEKLY', 0, 0, tuesday)
    expect(payOverviewLabel(r, tuesday)).toBe('Jul 26 – Aug 1')
  })

  it('names the month', () => {
    const r = payOverviewRange('MONTHLY', 0, 0, tuesday)
    expect(payOverviewLabel(r, tuesday)).toBe('July')
  })

  it('adds the year only when it differs from today', () => {
    const r = payOverviewRange('MONTHLY', -7, 0, tuesday)
    expect(payOverviewLabel(r, tuesday)).toBe('December 2025')
  })
})
