/**
 * Shared automation DTOs and constants. Safe in both the client and server
 * graphs — no prisma import beyond the erased enum types, mirroring
 * `taxonomy-types.ts`.
 *
 * Decimals cross the wire as strings, the same convention `AccountListItem`
 * follows: a `Decimal` does not survive JSON, and a `number` quietly loses
 * precision on the way back.
 */

import type { TransactionType } from '#/generated/prisma/enums'
import type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'

export type AutomationKind =
  | 'DUPLICATE_TO_ACCOUNT'
  | 'PERCENT_MATCH'
  | 'LOW_BALANCE_ALERT'

export const AUTOMATION_KINDS: readonly AutomationKind[] = [
  'DUPLICATE_TO_ACCOUNT',
  'PERCENT_MATCH',
  'LOW_BALANCE_ALERT',
]

export const AUTOMATION_KIND_LABELS: Record<AutomationKind, string> = {
  DUPLICATE_TO_ACCOUNT: 'Duplicate into another account',
  PERCENT_MATCH: 'Match a percentage',
  LOW_BALANCE_ALERT: 'Low balance alert',
}

export const AUTOMATION_KIND_DESCRIPTIONS: Record<AutomationKind, string> = {
  DUPLICATE_TO_ACCOUNT:
    'Copy a matching transaction into another account, same amount.',
  PERCENT_MATCH:
    'Create a second transaction for a percentage of the matching one.',
  LOW_BALANCE_ALERT: 'Email someone when an account drops below a floor.',
}

/** The two kinds that watch transactions. `LOW_BALANCE_ALERT` watches a balance. */
export const TRANSACTION_AUTOMATION_KINDS: readonly AutomationKind[] = [
  'DUPLICATE_TO_ACCOUNT',
  'PERCENT_MATCH',
]

/**
 * Types an automation may trigger on.
 *
 * `TRANSFER` and `BALANCE_ADJUSTMENT` are excluded deliberately: they are the
 * only two types `transactionTypeNeedsDirection` returns true for, so leaving
 * them out means the runner never has to invent a direction when it signs the
 * transaction it creates. Transfers are not hooked at all (see the note in
 * `createTransaction`), so a TRANSFER trigger could never fire anyway.
 */
export const AUTOMATION_TRIGGER_TYPES: readonly TransactionType[] = [
  'EXPENSE',
  'INCOME',
  'REFUND',
  'REIMBURSEMENT',
  'WITHDRAWAL',
  'DEPOSIT',
]

export type AutomationAccountRef = {
  id: string
  name: string
}

export type AutomationUserRef = {
  id: string
  name: string | null
  email: string | null
}

export type AutomationRunStatus = 'APPLIED' | 'SKIPPED' | 'FAILED'

export type AutomationRunDto = {
  id: string
  status: AutomationRunStatus
  detail: string | null
  createdAt: string
  createdTransactionId: string | null
}

export type AutomationDto = {
  id: string
  name: string
  kind: AutomationKind
  isEnabled: boolean
  triggerAccount: AutomationAccountRef
  triggerType: TransactionType | null
  triggerTags: ColoredTaxonomyRef[]
  triggerCategory: ColoredTaxonomyRef | null
  targetAccount: AutomationAccountRef | null
  /** Percent units as a decimal string, e.g. "15" or "12.5". */
  percent: string | null
  thresholdAmount: string | null
  notifyUser: AutomationUserRef | null
  alertingSince: string | null
  lastAlertedAt: string | null
  lastRun: AutomationRunDto | null
}
