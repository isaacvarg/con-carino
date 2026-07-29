/**
 * Does a transaction trip a rule?
 *
 * Match semantics: AND across filter kinds, OR within one. A rule fires when
 * the account matches AND the type matches AND the source carries at least one
 * of the rule's tags AND the category matches. An empty filter means "don't
 * care" rather than "must be empty" — a rule with no tags selected fires on
 * tagged and untagged transactions alike.
 *
 * All of this is here rather than in `src/server/automations.ts` on purpose:
 * the server module is untested by convention, so every decision it makes lives
 * in a pure function that is.
 */

import type { AutomationDto, AutomationKind } from '#/lib/automation-types'
import {
  AUTOMATION_KIND_LABELS,
  TRANSACTION_AUTOMATION_KINDS,
} from '#/lib/automation-types'

export type AutomationTrigger = {
  triggerAccountId: string
  /** Null means any type. */
  triggerTypeId: string | null
  /** Empty means any tag. */
  triggerTagIds: string[]
  /** Null means any category. */
  triggerCategoryId: string | null
}

export type AutomationSource = {
  id: string
  financialAccountId: string
  typeId: string
  tagIds: string[]
  categoryId: string | null
  createdByAutomationId: string | null
}

/**
 * Loop prevention, deliberately its own named function rather than an inline
 * `if`: a transaction an automation wrote must never trip another automation,
 * and that rule is easier to keep when it has a name and a test.
 */
export function isAutomationOrigin(
  source: Pick<AutomationSource, 'createdByAutomationId'>,
): boolean {
  return source.createdByAutomationId !== null
}

export type TriggerMismatch = 'account' | 'type' | 'tags' | 'category'

/** Which filter rejected the source, or null when every one passed. */
export function triggerMismatchReason(
  trigger: AutomationTrigger,
  source: AutomationSource,
): TriggerMismatch | null {
  if (trigger.triggerAccountId !== source.financialAccountId) return 'account'
  if (
    trigger.triggerTypeId !== null &&
    trigger.triggerTypeId !== source.typeId
  ) {
    return 'type'
  }
  if (
    trigger.triggerTagIds.length > 0 &&
    !trigger.triggerTagIds.some((id) => source.tagIds.includes(id))
  ) {
    return 'tags'
  }
  if (
    trigger.triggerCategoryId !== null &&
    trigger.triggerCategoryId !== source.categoryId
  ) {
    return 'category'
  }
  return null
}

export function matchesTrigger(
  trigger: AutomationTrigger,
  source: AutomationSource,
): boolean {
  return triggerMismatchReason(trigger, source) === null
}

export type TriggerCandidate = AutomationTrigger & {
  id: string
  isEnabled: boolean
  kind: AutomationKind
}

/**
 * The single choke point the runner calls. Drops, in order: anything an
 * automation wrote, disabled rules, rules that do not watch transactions, and
 * rules whose trigger does not match.
 *
 * Everything funnels through here so loop prevention cannot be skipped by a
 * caller that only remembered to check the filters.
 */
export function selectTriggeredAutomations<T extends TriggerCandidate>(
  automations: T[],
  source: AutomationSource,
): T[] {
  if (isAutomationOrigin(source)) return []
  return automations.filter(
    (automation) =>
      automation.isEnabled &&
      TRANSACTION_AUTOMATION_KINDS.includes(automation.kind) &&
      matchesTrigger(automation, source),
  )
}

function formatMoney(value: string | null): string {
  if (value === null) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatPercent(value: string | null): string {
  if (value === null) return '—'
  const percent = Number(value)
  if (!Number.isFinite(percent)) return `${value}%`
  // Trailing zeroes from Decimal(9,4) read as noise: "15.0000%" -> "15%".
  return `${String(percent)}%`
}

function describeFilters(automation: AutomationDto): string {
  const parts: string[] = []
  if (automation.triggerType) {
    parts.push(automation.triggerType.label.toLowerCase())
  }
  if (automation.triggerTags.length > 0) {
    parts.push(`tagged ${automation.triggerTags.map((t) => t.name).join(' or ')}`)
  }
  if (automation.triggerCategory) {
    parts.push(`in ${automation.triggerCategory.name}`)
  }
  return parts.length > 0 ? ` ${parts.join(', ')}` : ''
}

/** One-line plain-English summary for the settings list. */
export function summarizeAutomation(automation: AutomationDto): string {
  switch (automation.kind) {
    case 'DUPLICATE_TO_ACCOUNT':
      return `When a${describeFilters(automation)} transaction lands in ${
        automation.triggerAccount.name
      }, copy it into ${automation.targetAccount?.name ?? '—'}.`
    case 'PERCENT_MATCH':
      return `When a${describeFilters(automation)} transaction lands in ${
        automation.triggerAccount.name
      }, add ${formatPercent(automation.percent)} of it to ${
        automation.targetAccount?.name ?? '—'
      }.`
    case 'LOW_BALANCE_ALERT':
      return `When ${automation.triggerAccount.name} drops below ${formatMoney(
        automation.thresholdAmount,
      )}, email ${automation.notifyUser?.name ?? automation.notifyUser?.email ?? 'someone'}.`
    default: {
      const _exhaustive: never = automation.kind
      return AUTOMATION_KIND_LABELS[_exhaustive]
    }
  }
}
