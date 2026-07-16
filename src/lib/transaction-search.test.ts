import { describe, expect, it } from 'vitest'
import {
  searchTransactionIds,
  searchTransactions,
  type TransactionSearchable,
  type TransactionSearchKey,
} from '#/lib/transaction-search'

const rows: TransactionSearchable[] = [
  {
    id: '1',
    type: 'EXPENSE',
    amount: '-42.50',
    description: 'Weekly groceries',
    date: '2026-01-15T00:00:00.000Z',
    payee: { name: 'Whole Foods' },
    category: { name: 'Groceries' },
    tags: [{ name: 'food' }, { name: 'household' }],
    account: { name: 'Checking' },
  },
  {
    id: '2',
    type: 'INCOME',
    amount: '2500.00',
    description: 'January paycheck',
    date: '2026-01-01T00:00:00.000Z',
    payee: { name: 'Acme Corp' },
    category: { name: 'Salary' },
    tags: [{ name: 'work' }],
    account: { name: 'Checking' },
  },
  {
    id: '3',
    type: 'EXPENSE',
    amount: '-4.75',
    description: 'Morning latte',
    date: '2026-02-03T00:00:00.000Z',
    payee: { name: 'Coffee Shops LLC' },
    category: { name: 'Dining' },
    tags: [{ name: 'coffee' }],
    account: { name: 'Cash' },
  },
]

const allKeys: TransactionSearchKey[] = [
  'date',
  'account',
  'type',
  'payee',
  'category',
  'tags',
  'description',
  'amount',
]

function search(query: string, keys: TransactionSearchKey[] = allKeys) {
  return searchTransactions(rows, keys, query)
}

describe('searchTransactions', () => {
  it('returns every row untouched for an empty query', () => {
    expect(search('')).toEqual(rows)
    expect(search('   ')).toEqual(rows)
  })

  it('returns every row when no keys are provided', () => {
    expect(search('groceries', [])).toEqual(rows)
  })

  it('finds an exact description', () => {
    expect(search('Weekly groceries').map((row) => row.id)).toContain('1')
  })

  it('is case insensitive', () => {
    expect(search('whole foods').map((row) => row.id)).toContain('1')
  })

  it('tolerates a typo', () => {
    expect(search('grocerys').map((row) => row.id)).toContain('1')
  })

  it('matches mid-string, not just the start', () => {
    expect(search('Shops').map((row) => row.id)).toContain('3')
  })

  it('matches visible display labels like type', () => {
    expect(search('Income').map((row) => row.id)).toContain('2')
  })

  it('does not search omitted keys', () => {
    const onlyPayee = search('groceries', ['payee'])
    expect(onlyPayee.map((row) => row.id)).not.toContain('1')
    expect(search('Whole Foods', ['payee']).map((row) => row.id)).toContain('1')
  })

  it('returns nothing when there is no reasonable match', () => {
    expect(search('zzzzqqqq')).toEqual([])
  })
})

describe('searchTransactionIds', () => {
  it('returns null for an empty query', () => {
    expect(searchTransactionIds(rows, allKeys, '')).toBeNull()
    expect(searchTransactionIds(rows, allKeys, '   ')).toBeNull()
  })

  it('returns null when keys are empty', () => {
    expect(searchTransactionIds(rows, [], 'groceries')).toBeNull()
  })

  it('returns a set of matching ids', () => {
    const ids = searchTransactionIds(rows, allKeys, 'latte')
    expect(ids).not.toBeNull()
    expect(ids!.has('3')).toBe(true)
    expect(ids!.has('1')).toBe(false)
  })
})
