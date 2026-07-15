import { describe, expect, it } from 'vitest'
import { formatTransactionDate } from './account-utils'

describe('formatTransactionDate', () => {
  it('formats UTC midnight as the same calendar day in west-of-UTC zones', () => {
    // Stored calendar day is 15 Jul; local Intl without UTC would show 14 in PDT.
    expect(formatTransactionDate('2026-07-15T00:00:00.000Z')).toBe(
      'Jul 15, 2026',
    )
  })

  it('returns the original string when the ISO is invalid', () => {
    expect(formatTransactionDate('not-a-date')).toBe('not-a-date')
  })
})
