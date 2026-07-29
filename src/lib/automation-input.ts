/**
 * Payload validation for automation writes.
 *
 * Which nullable columns are required depends on `kind`, and Postgres enforces
 * that with the `automations_kind_shape_check` constraint. That constraint
 * produces an unreadable error, so this runs first and produces a sentence a
 * person can act on. The two must stay in agreement — if you loosen one, loosen
 * the other.
 */

import type { AutomationKind } from '#/lib/automation-types'
import { AUTOMATION_KINDS } from '#/lib/automation-types'
import { requireId, requireName } from '#/lib/validators'

export type AutomationInput = {
  name: string
  kind: AutomationKind
  isEnabled: boolean
  triggerAccountId: string
  triggerTypeId: string | null
  triggerTagIds: string[]
  triggerCategoryId: string | null
  targetAccountId: string | null
  percent: number | null
  thresholdAmount: number | null
  notifyUserId: string | null
}

/** Percent units, not a fraction: 15 means 15%. */
export function parsePercent(value: unknown): number {
  const percent =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isFinite(percent)) {
    throw new Error('Percent must be a number.')
  }
  if (percent <= 0 || percent > 100) {
    throw new Error('Percent must be greater than 0 and at most 100.')
  }
  return percent
}

/**
 * Any finite value, including a negative one — a credit card or a loan
 * legitimately sits below zero, and wanting to know when it drops past -$500 is
 * a reasonable rule.
 */
export function parseThresholdAmount(value: unknown): number {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isFinite(amount)) {
    throw new Error('Alert threshold must be a number.')
  }
  return amount
}

function parseKind(value: unknown): AutomationKind {
  if (
    typeof value !== 'string' ||
    !AUTOMATION_KINDS.includes(value as AutomationKind)
  ) {
    throw new Error('Automation kind is invalid.')
  }
  return value as AutomationKind
}

/**
 * Types are rows now, so this can only check the shape. That the id names a
 * live, non-directional type is checked against the database in
 * `assertUsableTriggerType` — the membership test that used to live here
 * cannot be done without a query.
 */
function parseTriggerTypeId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) {
    throw new Error('Pick a transaction type for this automation to watch.')
  }
  return id
}

function parseTagIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    // A duplicate id would make Prisma's `connect` throw, and an empty one
    // would never resolve.
    if (!id || ids.includes(id)) continue
    ids.push(id)
  }
  return ids
}

function optionalId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim() || null
}

export function parseAutomationInput(data: unknown): AutomationInput {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid payload.')
  }
  const input = data as Record<string, unknown>

  const kind = parseKind(input.kind)
  const name = requireName(input.name)
  const triggerAccountId = requireId(input.triggerAccountId)
  // Absent means "leave it on"; only an explicit false disables.
  const isEnabled = input.isEnabled === undefined ? true : Boolean(input.isEnabled)

  if (kind === 'LOW_BALANCE_ALERT') {
    return {
      name,
      kind,
      isEnabled,
      triggerAccountId,
      // A balance alert has no transaction filters at all — carrying them would
      // violate the kind check and read as if they did something.
      triggerTypeId: null,
      triggerTagIds: [],
      triggerCategoryId: null,
      targetAccountId: null,
      percent: null,
      thresholdAmount: parseThresholdAmount(input.thresholdAmount),
      notifyUserId: requireId(input.notifyUserId),
    }
  }

  const targetAccountId = requireId(input.targetAccountId)
  if (targetAccountId === triggerAccountId) {
    throw new Error(
      'The target account must be different from the account being watched.',
    )
  }

  return {
    name,
    kind,
    isEnabled,
    triggerAccountId,
    triggerTypeId: parseTriggerTypeId(input.triggerTypeId),
    triggerTagIds: parseTagIds(input.triggerTagIds),
    triggerCategoryId: optionalId(input.triggerCategoryId),
    targetAccountId,
    percent: kind === 'PERCENT_MATCH' ? parsePercent(input.percent) : null,
    thresholdAmount: null,
    notifyUserId: null,
  }
}
