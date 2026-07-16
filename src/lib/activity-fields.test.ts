import { describe, expect, it } from 'vitest'
import { formatActivityField } from '#/lib/activity'
import { TRANSACTION_UPDATE_ACTIVITY_FIELDS } from '#/lib/transaction-edit'

describe('formatActivityField', () => {
  it('labels the id-bearing snapshot fields in human terms', () => {
    expect(formatActivityField('categoryId')).toBe('Category')
    expect(formatActivityField('payeeId')).toBe('Payee')
    expect(formatActivityField('tagIds')).toBe('Tags')
    expect(formatActivityField('financialAccountId')).toBe('Account')
  })

  it('covers every field logged on a transaction update', () => {
    for (const field of TRANSACTION_UPDATE_ACTIVITY_FIELDS) {
      expect(formatActivityField(field)).not.toBe(field)
    }
  })

  it('falls back to the raw key for unknown fields', () => {
    expect(formatActivityField('somethingElse')).toBe('somethingElse')
  })
})
