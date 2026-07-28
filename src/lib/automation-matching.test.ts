import { describe, expect, it } from 'vitest'
import {
  isAutomationOrigin,
  matchesTrigger,
  selectTriggeredAutomations,
  summarizeAutomation,
  triggerMismatchReason,
  type AutomationSource,
  type AutomationTrigger,
  type TriggerCandidate,
} from '#/lib/automation-matching'
import type { AutomationDto } from '#/lib/automation-types'

function source(overrides: Partial<AutomationSource> = {}): AutomationSource {
  return {
    id: 'txn-1',
    financialAccountId: 'acct-main',
    type: 'DEPOSIT',
    tagIds: ['tag-vacation'],
    categoryId: 'cat-income',
    createdByAutomationId: null,
    ...overrides,
  }
}

function trigger(overrides: Partial<AutomationTrigger> = {}): AutomationTrigger {
  return {
    triggerAccountId: 'acct-main',
    triggerType: 'DEPOSIT',
    triggerTagIds: ['tag-vacation'],
    triggerCategoryId: 'cat-income',
    ...overrides,
  }
}

function candidate(overrides: Partial<TriggerCandidate> = {}): TriggerCandidate {
  return {
    id: 'auto-1',
    isEnabled: true,
    kind: 'DUPLICATE_TO_ACCOUNT',
    ...trigger(),
    ...overrides,
  }
}

describe('matchesTrigger', () => {
  it('matches when every filter agrees', () => {
    expect(matchesTrigger(trigger(), source())).toBe(true)
  })

  it('rejects a different account', () => {
    expect(triggerMismatchReason(trigger(), source({ financialAccountId: 'acct-other' })))
      .toBe('account')
  })

  it('rejects a different type', () => {
    expect(triggerMismatchReason(trigger(), source({ type: 'WITHDRAWAL' }))).toBe(
      'type',
    )
  })

  it('rejects a different category', () => {
    expect(triggerMismatchReason(trigger(), source({ categoryId: 'cat-other' })))
      .toBe('category')
    expect(triggerMismatchReason(trigger(), source({ categoryId: null }))).toBe(
      'category',
    )
  })

  describe('an empty filter means "any"', () => {
    it('matches tagged and untagged sources when no tags are selected', () => {
      const t = trigger({ triggerTagIds: [] })
      expect(matchesTrigger(t, source({ tagIds: [] }))).toBe(true)
      expect(matchesTrigger(t, source({ tagIds: ['tag-anything'] }))).toBe(true)
    })

    it('matches any category when none is selected', () => {
      const t = trigger({ triggerCategoryId: null })
      expect(matchesTrigger(t, source({ categoryId: null }))).toBe(true)
      expect(matchesTrigger(t, source({ categoryId: 'cat-whatever' }))).toBe(true)
    })

    it('matches any type when none is selected', () => {
      const t = trigger({ triggerType: null })
      expect(matchesTrigger(t, source({ type: 'REFUND' }))).toBe(true)
    })
  })

  describe('tags are OR within the kind', () => {
    const t = trigger({ triggerTagIds: ['tag-a', 'tag-b'] })

    it('matches when the source shares any one tag', () => {
      expect(matchesTrigger(t, source({ tagIds: ['tag-b'] }))).toBe(true)
      expect(matchesTrigger(t, source({ tagIds: ['tag-a', 'tag-z'] }))).toBe(true)
    })

    it('rejects when the source shares none', () => {
      expect(triggerMismatchReason(t, source({ tagIds: ['tag-z'] }))).toBe('tags')
      expect(triggerMismatchReason(t, source({ tagIds: [] }))).toBe('tags')
    })
  })

  it('ANDs across filter kinds — three of four is not a match', () => {
    // Account, type and tags all agree; only the category differs.
    expect(matchesTrigger(trigger(), source({ categoryId: 'cat-other' }))).toBe(
      false,
    )
  })
})

describe('isAutomationOrigin', () => {
  it('is true only for a transaction an automation wrote', () => {
    expect(isAutomationOrigin({ createdByAutomationId: null })).toBe(false)
    expect(isAutomationOrigin({ createdByAutomationId: 'auto-1' })).toBe(true)
  })
})

describe('selectTriggeredAutomations', () => {
  it('returns every matching rule, in order', () => {
    const rules = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    expect(selectTriggeredAutomations(rules, source()).map((r) => r.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('drops an automation-written source even when every filter matches', () => {
    // The loop-prevention regression test. A duplicate landing in the target
    // account must never trip a rule watching that account.
    const rules = [candidate()]
    const written = source({ createdByAutomationId: 'auto-99' })
    expect(matchesTrigger(trigger(), written)).toBe(true)
    expect(selectTriggeredAutomations(rules, written)).toEqual([])
  })

  it('drops disabled rules', () => {
    expect(selectTriggeredAutomations([candidate({ isEnabled: false })], source()))
      .toEqual([])
  })

  it('drops rules that watch a balance rather than transactions', () => {
    expect(
      selectTriggeredAutomations([candidate({ kind: 'LOW_BALANCE_ALERT' })], source()),
    ).toEqual([])
  })

  it('drops non-matching rules while keeping matching siblings', () => {
    const rules = [
      candidate({ id: 'match' }),
      candidate({ id: 'wrong-type', triggerType: 'WITHDRAWAL' }),
    ]
    expect(selectTriggeredAutomations(rules, source()).map((r) => r.id)).toEqual([
      'match',
    ])
  })
})

function dto(overrides: Partial<AutomationDto> = {}): AutomationDto {
  return {
    id: 'auto-1',
    name: 'Vacation mirror',
    kind: 'DUPLICATE_TO_ACCOUNT',
    isEnabled: true,
    triggerAccount: { id: 'acct-main', name: 'Main' },
    triggerType: 'DEPOSIT',
    triggerTags: [
      { id: 'tag-vacation', name: 'vacation', bgColor: null, textColor: null },
    ],
    triggerCategory: null,
    targetAccount: { id: 'acct-pot', name: 'Vacation Pot' },
    percent: null,
    thresholdAmount: null,
    notifyUser: null,
    alertingSince: null,
    lastAlertedAt: null,
    lastRun: null,
    ...overrides,
  }
}

describe('summarizeAutomation', () => {
  it('describes a duplicate rule with its filters', () => {
    expect(summarizeAutomation(dto())).toBe(
      'When a deposit, tagged vacation transaction lands in Main, copy it into Vacation Pot.',
    )
  })

  it('joins multiple tags with "or" to match the OR-within semantics', () => {
    const summary = summarizeAutomation(
      dto({
        triggerTags: [
          { id: 't1', name: 'vacation', bgColor: null, textColor: null },
          { id: 't2', name: 'bonus', bgColor: null, textColor: null },
        ],
      }),
    )
    expect(summary).toContain('tagged vacation or bonus')
  })

  it('describes a percent rule without trailing decimal noise', () => {
    const summary = summarizeAutomation(
      dto({
        kind: 'PERCENT_MATCH',
        triggerType: 'WITHDRAWAL',
        triggerTags: [],
        percent: '15.0000',
      }),
    )
    expect(summary).toBe(
      'When a withdrawal transaction lands in Main, add 15% of it to Vacation Pot.',
    )
  })

  it('keeps a fractional percent', () => {
    const summary = summarizeAutomation(
      dto({ kind: 'PERCENT_MATCH', triggerTags: [], percent: '12.5000' }),
    )
    expect(summary).toContain('12.5%')
  })

  it('describes a low-balance rule with formatted money', () => {
    const summary = summarizeAutomation(
      dto({
        kind: 'LOW_BALANCE_ALERT',
        triggerType: null,
        triggerTags: [],
        targetAccount: null,
        thresholdAmount: '200.0000',
        notifyUser: { id: 'u1', name: 'Isaac', email: 'isaac@example.com' },
      }),
    )
    expect(summary).toBe('When Main drops below $200.00, email Isaac.')
  })

  it('falls back to an email when the notified user has no name', () => {
    const summary = summarizeAutomation(
      dto({
        kind: 'LOW_BALANCE_ALERT',
        triggerType: null,
        triggerTags: [],
        targetAccount: null,
        thresholdAmount: '200.0000',
        notifyUser: { id: 'u1', name: null, email: 'isaac@example.com' },
      }),
    )
    expect(summary).toContain('email isaac@example.com')
  })

  it('reads sensibly with no filters at all', () => {
    const summary = summarizeAutomation(
      dto({ triggerType: null, triggerTags: [], triggerCategory: null }),
    )
    expect(summary).toBe('When a transaction lands in Main, copy it into Vacation Pot.')
  })
})
