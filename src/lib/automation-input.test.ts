import { describe, expect, it } from 'vitest'
import {
  parseAutomationInput,
  parsePercent,
  parseThresholdAmount,
} from '#/lib/automation-input'

const DUPLICATE = {
  kind: 'DUPLICATE_TO_ACCOUNT',
  name: 'Vacation mirror',
  triggerAccountId: 'acct-main',
  triggerType: 'DEPOSIT',
  targetAccountId: 'acct-pot',
}

const PERCENT = {
  kind: 'PERCENT_MATCH',
  name: 'Save 15%',
  triggerAccountId: 'acct-main',
  triggerType: 'WITHDRAWAL',
  targetAccountId: 'acct-pot',
  percent: 15,
}

const LOW_BALANCE = {
  kind: 'LOW_BALANCE_ALERT',
  name: 'Pot floor',
  triggerAccountId: 'acct-pot',
  thresholdAmount: 200,
  notifyUserId: 'user-1',
}

describe('parsePercent', () => {
  it('accepts numbers and numeric strings in range', () => {
    expect(parsePercent(15)).toBe(15)
    expect(parsePercent('15.25')).toBe(15.25)
    expect(parsePercent(' 15 ')).toBe(15)
    expect(parsePercent(100)).toBe(100)
  })

  it('rejects out-of-range and non-numeric values', () => {
    for (const bad of [0, -5, 100.1, 'abc', Number.NaN, Number.POSITIVE_INFINITY, null, {}]) {
      expect(() => parsePercent(bad)).toThrow()
    }
  })
})

describe('parseThresholdAmount', () => {
  it('accepts any finite amount, including negative', () => {
    expect(parseThresholdAmount(200)).toBe(200)
    expect(parseThresholdAmount('200.50')).toBe(200.5)
    // A credit card sits below zero; a floor of -$500 is a real rule.
    expect(parseThresholdAmount(-500)).toBe(-500)
    expect(parseThresholdAmount(0)).toBe(0)
  })

  it('rejects non-numeric values', () => {
    for (const bad of ['abc', Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(() => parseThresholdAmount(bad)).toThrow()
    }
  })
})

describe('parseAutomationInput', () => {
  it('rejects a non-object payload', () => {
    expect(() => parseAutomationInput(null)).toThrow('Invalid payload.')
    expect(() => parseAutomationInput('nope')).toThrow('Invalid payload.')
  })

  it('rejects an unknown kind', () => {
    expect(() => parseAutomationInput({ ...DUPLICATE, kind: 'SOMETHING' })).toThrow(
      'Automation kind is invalid.',
    )
  })

  it('requires a name and a trigger account for every kind', () => {
    expect(() => parseAutomationInput({ ...DUPLICATE, name: '  ' })).toThrow()
    expect(() => parseAutomationInput({ ...DUPLICATE, triggerAccountId: '' })).toThrow()
    expect(() => parseAutomationInput({ ...LOW_BALANCE, name: '' })).toThrow()
  })

  it('defaults isEnabled to true and honours an explicit false', () => {
    expect(parseAutomationInput(DUPLICATE).isEnabled).toBe(true)
    expect(parseAutomationInput({ ...DUPLICATE, isEnabled: false }).isEnabled).toBe(
      false,
    )
  })

  describe('DUPLICATE_TO_ACCOUNT', () => {
    it('requires a type and a target account', () => {
      expect(() =>
        parseAutomationInput({ ...DUPLICATE, triggerType: undefined }),
      ).toThrow('Transaction type is invalid for an automation trigger.')
      expect(() =>
        parseAutomationInput({ ...DUPLICATE, targetAccountId: '' }),
      ).toThrow()
    })

    it('never carries a percent, even when one is supplied', () => {
      expect(parseAutomationInput({ ...DUPLICATE, percent: 15 }).percent).toBeNull()
    })

    it('never carries low-balance fields', () => {
      const parsed = parseAutomationInput({
        ...DUPLICATE,
        thresholdAmount: 200,
        notifyUserId: 'user-1',
      })
      expect(parsed.thresholdAmount).toBeNull()
      expect(parsed.notifyUserId).toBeNull()
    })

    it('rejects a target that is the watched account', () => {
      expect(() =>
        parseAutomationInput({ ...DUPLICATE, targetAccountId: 'acct-main' }),
      ).toThrow('must be different')
    })

    it('rejects a directional type the runner could not sign', () => {
      for (const type of ['TRANSFER', 'BALANCE_ADJUSTMENT']) {
        expect(() => parseAutomationInput({ ...DUPLICATE, triggerType: type })).toThrow(
          'Transaction type is invalid for an automation trigger.',
        )
      }
    })

    it('normalizes the tag list', () => {
      const parsed = parseAutomationInput({
        ...DUPLICATE,
        triggerTagIds: [' tag-a ', 'tag-a', '', 42, null, 'tag-b'],
      })
      expect(parsed.triggerTagIds).toEqual(['tag-a', 'tag-b'])
    })

    it('treats a missing or blank category as "any"', () => {
      expect(parseAutomationInput(DUPLICATE).triggerCategoryId).toBeNull()
      expect(
        parseAutomationInput({ ...DUPLICATE, triggerCategoryId: '   ' })
          .triggerCategoryId,
      ).toBeNull()
    })
  })

  describe('PERCENT_MATCH', () => {
    it('requires a valid percent', () => {
      expect(parseAutomationInput(PERCENT).percent).toBe(15)
      expect(() => parseAutomationInput({ ...PERCENT, percent: 0 })).toThrow()
      expect(() => parseAutomationInput({ ...PERCENT, percent: undefined })).toThrow()
    })
  })

  describe('LOW_BALANCE_ALERT', () => {
    it('requires a threshold and a recipient', () => {
      expect(() =>
        parseAutomationInput({ ...LOW_BALANCE, thresholdAmount: undefined }),
      ).toThrow()
      expect(() =>
        parseAutomationInput({ ...LOW_BALANCE, notifyUserId: '' }),
      ).toThrow()
    })

    it('strips transaction filters and the target account', () => {
      const parsed = parseAutomationInput({
        ...LOW_BALANCE,
        triggerType: 'DEPOSIT',
        triggerTagIds: ['tag-a'],
        triggerCategoryId: 'cat-a',
        targetAccountId: 'acct-main',
        percent: 15,
      })
      expect(parsed.triggerType).toBeNull()
      expect(parsed.triggerTagIds).toEqual([])
      expect(parsed.triggerCategoryId).toBeNull()
      expect(parsed.targetAccountId).toBeNull()
      expect(parsed.percent).toBeNull()
    })

    it('accepts a negative floor', () => {
      expect(
        parseAutomationInput({ ...LOW_BALANCE, thresholdAmount: -500 })
          .thresholdAmount,
      ).toBe(-500)
    })
  })
})
