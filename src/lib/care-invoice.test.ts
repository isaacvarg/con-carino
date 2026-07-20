import { describe, expect, it } from 'vitest'
import {
  billableQuantity,
  computeInvoiceAmount,
  effectiveRate,
  lastClosedPayPeriodEnd,
  payPeriodStart,
} from '#/lib/care-invoice'

describe('computeInvoiceAmount', () => {
  it('multiplies rate by quantity', () => {
    expect(computeInvoiceAmount(25, 8).amount).toBe(200)
    expect(computeInvoiceAmount(150, 1).amount).toBe(150)
  })

  it('rejects non-positive quantity', () => {
    expect(() => computeInvoiceAmount(25, 0)).toThrow()
  })
})

describe('billableQuantity', () => {
  const start = new Date(2026, 6, 20, 0, 0, 0)

  it('returns hours for HOURLY', () => {
    const end = new Date(2026, 6, 20, 8, 0, 0)
    expect(billableQuantity(start, end, 'HOURLY')).toBe(8)
  })

  it('returns 1 day for a 24h DAILY slot', () => {
    const end = new Date(2026, 6, 21, 0, 0, 0)
    expect(billableQuantity(start, end, 'DAILY')).toBe(1)
  })

  it('returns 2 days for a 48h DAILY slot', () => {
    const end = new Date(2026, 6, 22, 0, 0, 0)
    expect(billableQuantity(start, end, 'DAILY')).toBe(2)
  })
})

describe('effectiveRate', () => {
  it('returns null for unpaid types', () => {
    expect(
      effectiveRate({
        personHourlyRate: 25,
        typeIsPaid: false,
      }),
    ).toBeNull()
  })

  it('returns null when a paid person has no rate', () => {
    expect(
      effectiveRate({
        personHourlyRate: null,
        typeIsPaid: true,
      }),
    ).toBeNull()
  })

  it('uses the person rate paired with its rate type', () => {
    expect(
      effectiveRate({
        personHourlyRate: 200,
        personRateType: 'DAILY',
        typeIsPaid: true,
      }),
    ).toEqual({ amount: 200, rateType: 'DAILY' })
  })

  it('defaults rate type to HOURLY when unspecified', () => {
    expect(
      effectiveRate({
        personHourlyRate: 30,
        typeIsPaid: true,
      }),
    ).toEqual({ amount: 30, rateType: 'HOURLY' })
  })
})

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
