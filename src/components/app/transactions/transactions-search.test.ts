import { describe, expect, it } from 'vitest'
import {
  transactionsSearchDefaults,
  validateTransactionsSearch,
} from './transactions-search'

describe('validateTransactionsSearch accountType', () => {
  it('defaults to every account type except virtual', () => {
    const search = validateTransactionsSearch({})

    expect(search.accountType.split(',')).toEqual([
      'CHECKING',
      'SAVINGS',
      'CREDIT_CARD',
      'CASH',
      'INVESTMENT',
      'LOAN',
    ])
    expect(search.accountType).not.toContain('VIRTUAL')
    expect(search.accountType).toBe(transactionsSearchDefaults.accountType)
  })

  it('keeps an explicitly cleared facet empty so all types show', () => {
    expect(validateTransactionsSearch({ accountType: '' }).accountType).toBe('')
  })

  it('keeps an explicit virtual selection', () => {
    expect(
      validateTransactionsSearch({ accountType: 'VIRTUAL' }).accountType,
    ).toBe('VIRTUAL')
  })

  it('normalizes whitespace and blank entries', () => {
    expect(
      validateTransactionsSearch({ accountType: ' CASH , ,VIRTUAL,' })
        .accountType,
    ).toBe('CASH,VIRTUAL')
  })

  it('falls back to the default for non-string values', () => {
    expect(validateTransactionsSearch({ accountType: 42 }).accountType).toBe(
      transactionsSearchDefaults.accountType,
    )
  })

  it('leaves the other facets defaulting to empty', () => {
    const search = validateTransactionsSearch({})

    expect(search.account).toBe('')
    expect(search.type).toBe('')
    expect(search.category).toBe('')
    expect(search.payee).toBe('')
    expect(search.tags).toBe('')
  })
})
