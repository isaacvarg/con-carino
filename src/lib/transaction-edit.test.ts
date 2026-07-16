import { describe, expect, it } from 'vitest'
import { diffChanges } from '#/lib/activity'
import {
  buildTransactionActivitySnapshot,
  directionFromSignedAmount,
  magnitudeFromSignedAmount,
  planAttachmentChanges,
  TRANSACTION_UPDATE_ACTIVITY_FIELDS,
} from '#/lib/transaction-edit'
import { toSignedTransactionAmount } from '#/lib/transaction-amount'

describe('planAttachmentChanges', () => {
  it('retains keep ids and removes the rest', () => {
    expect(
      planAttachmentChanges({
        existingIds: ['a', 'b', 'c'],
        keepIds: ['c', 'a', 'a', 'missing'],
        newCount: 1,
      }),
    ).toEqual({
      retainIds: ['c', 'a'],
      removeIds: ['b'],
      totalAfter: 3,
    })
  })

  it('throws when retained plus new exceeds the cap', () => {
    expect(() =>
      planAttachmentChanges({
        existingIds: ['a', 'b', 'c', 'd'],
        keepIds: ['a', 'b', 'c', 'd'],
        newCount: 2,
        max: 5,
      }),
    ).toThrow(/at most 5/)
  })
})

describe('amount helpers', () => {
  it('converts signed amounts to magnitude and direction', () => {
    expect(magnitudeFromSignedAmount('-12.5')).toBe('12.50')
    expect(directionFromSignedAmount('-12.5')).toBe('out')
    expect(directionFromSignedAmount('4')).toBe('in')
  })

  it('preserves opposite transfer signs when syncing magnitude', () => {
    const magnitude = 42.5
    const outLeg = toSignedTransactionAmount('TRANSFER', magnitude, 'out')
    const inLeg = toSignedTransactionAmount('TRANSFER', magnitude, 'in')
    expect(outLeg).toBe(-42.5)
    expect(inLeg).toBe(42.5)
    expect(directionFromSignedAmount(outLeg)).toBe('out')
    expect(directionFromSignedAmount(inLeg)).toBe('in')
  })
})

describe('transaction activity snapshots', () => {
  it('sorts relation ids and diffs editable fields', () => {
    const before = buildTransactionActivitySnapshot({
      financialAccountId: 'acct-1',
      type: 'EXPENSE',
      amount: '-10',
      description: 'Coffee',
      date: '2026-07-01T00:00:00.000Z',
      payeeId: 'payee-1',
      categoryId: null,
      transferGroupId: null,
      tagIds: ['tag-b', 'tag-a'],
      attachmentIds: ['att-2', 'att-1'],
    })
    const after = buildTransactionActivitySnapshot({
      financialAccountId: 'acct-1',
      type: 'EXPENSE',
      amount: '-12',
      description: null,
      date: '2026-07-01T00:00:00.000Z',
      payeeId: null,
      categoryId: 'cat-1',
      transferGroupId: null,
      tagIds: ['tag-a'],
      attachmentIds: ['att-1'],
    })

    expect(before.tagIds).toEqual(['tag-a', 'tag-b'])
    expect(before.attachmentIds).toEqual(['att-1', 'att-2'])

    const changes = diffChanges(
      before,
      after,
      TRANSACTION_UPDATE_ACTIVITY_FIELDS,
    )
    expect(changes.amount).toEqual({ before: '-10', after: '-12' })
    expect(changes.description).toEqual({ before: 'Coffee', after: null })
    expect(changes.payeeId).toEqual({ before: 'payee-1', after: null })
    expect(changes.categoryId).toEqual({ before: null, after: 'cat-1' })
    expect(changes.tagIds).toEqual({
      before: JSON.stringify(['tag-a', 'tag-b']),
      after: JSON.stringify(['tag-a']),
    })
    expect(changes.attachmentIds).toEqual({
      before: JSON.stringify(['att-1', 'att-2']),
      after: JSON.stringify(['att-1']),
    })
    expect(changes.type).toBeUndefined()
  })
})
