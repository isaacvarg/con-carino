import { describe, expect, it } from 'vitest'
import {
  activeTransactionTypes,
  automationTriggerTypes,
  defaultDirectionForType,
  findTransactionTypeByKey,
  signedAmountFor,
  transactionTypeLabel,
  transactionTypeOptions,
  typeNeedsDirection,
  type TransactionTypeDto,
} from '#/lib/transaction-types'

function type(
  overrides: Partial<TransactionTypeDto> & Pick<TransactionTypeDto, 'key'>,
): TransactionTypeDto {
  return {
    id: `type-${overrides.key.toLowerCase()}`,
    label: overrides.key,
    sign: 'NEGATIVE',
    isSystem: true,
    sortOrder: 0,
    archivedAt: null,
    ...overrides,
  }
}

const EXPENSE = type({ key: 'EXPENSE', label: 'Expense', sign: 'NEGATIVE' })
const INCOME = type({
  key: 'INCOME',
  label: 'Income',
  sign: 'POSITIVE',
  sortOrder: 1,
})
const TRANSFER = type({
  key: 'TRANSFER',
  label: 'Transfer',
  sign: 'DIRECTIONAL',
  sortOrder: 2,
})
const RETIRED = type({
  key: 'RETIRED',
  label: 'Retired',
  sign: 'POSITIVE',
  sortOrder: 3,
  archivedAt: '2026-07-01T00:00:00.000Z',
})

const registry = [EXPENSE, INCOME, TRANSFER, RETIRED]

describe('signedAmountFor', () => {
  it('makes negative types negative and positive types positive', () => {
    expect(signedAmountFor(EXPENSE, 25)).toBe(-25)
    expect(signedAmountFor(INCOME, 25)).toBe(25)
  })

  it('ignores the sign of the magnitude it is handed', () => {
    // Forms submit a positive magnitude, but an edit round-trip can hand back
    // an already-signed value; the type decides, not the input.
    expect(signedAmountFor(EXPENSE, -25)).toBe(-25)
    expect(signedAmountFor(INCOME, -25)).toBe(25)
  })

  it('uses the direction for directional types', () => {
    expect(signedAmountFor(TRANSFER, 25, 'out')).toBe(-25)
    expect(signedAmountFor(TRANSFER, 25, 'in')).toBe(25)
  })

  it('refuses a directional type with no direction', () => {
    expect(() => signedAmountFor(TRANSFER, 25)).toThrow(
      'Direction is required for this transaction type.',
    )
  })

  it('ignores a direction on a non-directional type', () => {
    expect(signedAmountFor(EXPENSE, 25, 'in')).toBe(-25)
  })

  it('rejects a non-finite amount', () => {
    expect(() => signedAmountFor(EXPENSE, Number.NaN)).toThrow(
      'Amount must be a valid number.',
    )
  })
})

describe('typeNeedsDirection', () => {
  it('is true only for directional types', () => {
    expect(typeNeedsDirection(TRANSFER)).toBe(true)
    expect(typeNeedsDirection(EXPENSE)).toBe(false)
    expect(typeNeedsDirection(INCOME)).toBe(false)
  })
})

describe('defaultDirectionForType', () => {
  it('defaults a balance adjustment to money in, everything else to out', () => {
    expect(defaultDirectionForType({ key: 'BALANCE_ADJUSTMENT' })).toBe('in')
    expect(defaultDirectionForType(TRANSFER)).toBe('out')
  })
})

describe('registry selectors', () => {
  it('hides archived types from the live list', () => {
    expect(activeTransactionTypes(registry).map((t) => t.key)).toEqual([
      'EXPENSE',
      'INCOME',
      'TRANSFER',
    ])
  })

  it('orders by sortOrder, falling back to label', () => {
    const shuffled = [
      type({ key: 'B', label: 'Beta', sortOrder: 5 }),
      type({ key: 'A', label: 'Alpha', sortOrder: 5 }),
      type({ key: 'C', label: 'Gamma', sortOrder: 1 }),
    ]
    expect(activeTransactionTypes(shuffled).map((t) => t.label)).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ])
  })

  it('keeps transfers out of the add-transaction picker', () => {
    // A transfer is a pair of linked rows written by createTransfer, not
    // something the single-row form can produce.
    expect(transactionTypeOptions(registry).map((t) => t.key)).toEqual([
      'EXPENSE',
      'INCOME',
    ])
  })

  it('keeps directional types out of automation triggers', () => {
    // The runner signs with no direction argument, so it could not sign one.
    expect(automationTriggerTypes(registry).map((t) => t.key)).toEqual([
      'EXPENSE',
      'INCOME',
    ])
  })

  it('resolves labels and keys, and degrades rather than throwing', () => {
    expect(transactionTypeLabel(registry, EXPENSE.id)).toBe('Expense')
    expect(transactionTypeLabel(registry, 'gone')).toBe('Unknown type')
    expect(transactionTypeLabel(registry, null)).toBe('Unknown type')
    expect(findTransactionTypeByKey(registry, 'TRANSFER')).toBe(TRANSFER)
    expect(findTransactionTypeByKey(registry, 'NOPE')).toBeNull()
  })
})
