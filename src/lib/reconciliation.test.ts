import { describe, expect, it } from 'vitest'
import {
  assertCanMutateReconciliationStatus,
  isMutableReconciliationStatus,
  nextStatusOnCardTap,
  reconciliationStatusActivitySummary,
  reconciliationStatusLabel,
  transactionPayeeLabel,
} from '#/lib/reconciliation'

describe('reconciliation status helpers', () => {
  it('allows mutable statuses and rejects reconciled mutations', () => {
    expect(isMutableReconciliationStatus('UNCLEARED')).toBe(true)
    expect(isMutableReconciliationStatus('CLEARED')).toBe(true)
    expect(isMutableReconciliationStatus('NEEDS_REVIEW')).toBe(true)
    expect(isMutableReconciliationStatus('RECONCILED')).toBe(false)
    expect(() =>
      assertCanMutateReconciliationStatus('RECONCILED'),
    ).toThrow(/cannot be changed/)
    expect(() => assertCanMutateReconciliationStatus('CLEARED')).not.toThrow()
  })

  it('toggles cleared on card tap and clears needs review', () => {
    expect(nextStatusOnCardTap('UNCLEARED')).toBe('CLEARED')
    expect(nextStatusOnCardTap('CLEARED')).toBe('UNCLEARED')
    expect(nextStatusOnCardTap('NEEDS_REVIEW')).toBe('CLEARED')
    expect(nextStatusOnCardTap('RECONCILED')).toBeNull()
  })

  it('formats labels and activity summaries', () => {
    expect(reconciliationStatusLabel('NEEDS_REVIEW')).toBe('Needs review')
    expect(reconciliationStatusActivitySummary('CLEARED')).toBe(
      'Marked as cleared',
    )
    expect(reconciliationStatusActivitySummary('RECONCILED')).toBe(
      'Reconciled transaction',
    )
  })

  it('prefers payee name then description', () => {
    expect(
      transactionPayeeLabel({
        payee: { name: 'Cafe' },
        description: 'Coffee',
      }),
    ).toBe('Cafe')
    expect(
      transactionPayeeLabel({
        payee: null,
        description: 'Coffee',
      }),
    ).toBe('Coffee')
    expect(transactionPayeeLabel({ payee: null, description: null })).toBe('—')
  })
})
