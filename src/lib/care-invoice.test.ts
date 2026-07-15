import { describe, expect, it } from 'vitest'
import {
  lastClosedPayPeriodEnd,
  payPeriodStart,
} from '#/lib/care-invoice'

describe('lastClosedPayPeriodEnd', () => {
  it('returns now for PER_SHIFT', () => {
    const now = new Date(2026, 6, 15, 12, 0, 0)
    const end = lastClosedPayPeriodEnd(
      {
        payInterval: 'PER_SHIFT',
        payWeekday: null,
        payAnchorDate: null,
        payMonthDay: null,
      },
      now,
    )
    expect(end?.getTime()).toBe(now.getTime())
  })

  it('returns last Friday EOD for weekly Friday schedule', () => {
    // Wednesday Jul 15, 2026
    const now = new Date(2026, 6, 15, 12, 0, 0)
    const end = lastClosedPayPeriodEnd(
      {
        payInterval: 'WEEKLY',
        payWeekday: 5,
        payAnchorDate: null,
        payMonthDay: null,
      },
      now,
    )
    expect(end).not.toBeNull()
    // Friday Jul 10, 2026 end of day
    expect(end!.getFullYear()).toBe(2026)
    expect(end!.getMonth()).toBe(6)
    expect(end!.getDate()).toBe(10)
  })

  it('requires config for biweekly', () => {
    const end = lastClosedPayPeriodEnd(
      {
        payInterval: 'BIWEEKLY',
        payWeekday: 5,
        payAnchorDate: null,
        payMonthDay: null,
      },
      new Date(),
    )
    expect(end).toBeNull()
  })
})

describe('payPeriodStart', () => {
  it('starts 6 days before weekly period end', () => {
    const periodEnd = new Date(2026, 6, 10, 23, 59, 59, 999)
    const start = payPeriodStart(
      {
        payInterval: 'WEEKLY',
        payWeekday: 5,
        payAnchorDate: null,
        payMonthDay: null,
      },
      periodEnd,
    )
    expect(start.getDate()).toBe(4)
  })
})
