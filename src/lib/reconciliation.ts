import type { ReconciliationStatus } from '#/generated/prisma/enums'

export const RECONCILIATION_STATUSES = [
  'UNCLEARED',
  'CLEARED',
  'NEEDS_REVIEW',
  'RECONCILED',
] as const satisfies readonly ReconciliationStatus[]

export type MutableReconciliationStatus = Exclude<
  ReconciliationStatus,
  'RECONCILED'
>

const MUTABLE_STATUSES = new Set<string>([
  'UNCLEARED',
  'CLEARED',
  'NEEDS_REVIEW',
])

export function isReconciliationStatus(
  value: unknown,
): value is ReconciliationStatus {
  return (
    typeof value === 'string' &&
    (RECONCILIATION_STATUSES as readonly string[]).includes(value)
  )
}

export function isMutableReconciliationStatus(
  value: unknown,
): value is MutableReconciliationStatus {
  return typeof value === 'string' && MUTABLE_STATUSES.has(value)
}

export function assertCanMutateReconciliationStatus(
  current: ReconciliationStatus,
): void {
  if (current === 'RECONCILED') {
    throw new Error('Reconciled transactions cannot be changed.')
  }
}

/** Tap card: uncleared ↔ cleared; needs review → cleared. */
export function nextStatusOnCardTap(
  current: ReconciliationStatus,
): MutableReconciliationStatus | null {
  if (current === 'RECONCILED') return null
  if (current === 'CLEARED') return 'UNCLEARED'
  return 'CLEARED'
}

export function reconciliationStatusLabel(
  status: ReconciliationStatus,
): string {
  switch (status) {
    case 'UNCLEARED':
      return 'Uncleared'
    case 'CLEARED':
      return 'Cleared'
    case 'NEEDS_REVIEW':
      return 'Needs review'
    case 'RECONCILED':
      return 'Reconciled'
    default:
      return status
  }
}

export function reconciliationStatusActivitySummary(
  status: ReconciliationStatus,
): string {
  switch (status) {
    case 'UNCLEARED':
      return 'Marked as uncleared'
    case 'CLEARED':
      return 'Marked as cleared'
    case 'NEEDS_REVIEW':
      return 'Marked as needs review'
    case 'RECONCILED':
      return 'Reconciled transaction'
    default:
      return 'Updated reconciliation status'
  }
}

export function transactionPayeeLabel(txn: {
  payee: { name: string } | null
  description: string | null
}): string {
  const payeeName = txn.payee?.name?.trim()
  if (payeeName) return payeeName
  const description = txn.description?.trim()
  if (description) return description
  return '—'
}
