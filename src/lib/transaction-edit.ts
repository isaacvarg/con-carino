import { MAX_ATTACHMENTS_PER_TXN } from '#/lib/attachment-types'
import type { TransactionDirection } from '#/lib/transaction-amount'

export type AttachmentChangePlan = {
  retainIds: string[]
  removeIds: string[]
  totalAfter: number
}

/**
 * Compute which existing attachments to keep vs remove, and validate the
 * final count against the per-transaction cap (retained + newly uploaded).
 */
export function planAttachmentChanges(options: {
  existingIds: string[]
  keepIds: string[]
  newCount: number
  max?: number
}): AttachmentChangePlan {
  const max = options.max ?? MAX_ATTACHMENTS_PER_TXN
  const existingSet = new Set(options.existingIds)
  const seen = new Set<string>()
  const retainIds: string[] = []

  for (const id of options.keepIds) {
    if (!existingSet.has(id) || seen.has(id)) continue
    seen.add(id)
    retainIds.push(id)
  }

  const removeIds = options.existingIds.filter((id) => !seen.has(id))
  const newCount = Math.max(0, Math.floor(options.newCount))
  const totalAfter = retainIds.length + newCount

  if (totalAfter > max) {
    throw new Error(`You can attach at most ${max} files.`)
  }

  return { retainIds, removeIds, totalAfter }
}

/** Infer form direction from a stored signed amount. */
export function directionFromSignedAmount(
  amount: number | string,
): TransactionDirection {
  const value = typeof amount === 'string' ? Number(amount) : amount
  return Number.isFinite(value) && value >= 0 ? 'in' : 'out'
}

/** Positive magnitude for edit forms from a stored signed amount. */
export function magnitudeFromSignedAmount(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(value)) return ''
  return Math.abs(value).toFixed(2)
}

export function sortedIdList(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b))
}

/** Snapshot fields used when logging transaction UPDATEs. */
export const TRANSACTION_UPDATE_ACTIVITY_FIELDS = [
  'financialAccountId',
  'type',
  'amount',
  'description',
  'date',
  'payeeId',
  'categoryId',
  'transferGroupId',
  'tagIds',
  'attachmentIds',
  'reconciliationStatus',
] as const

export type TransactionActivitySnapshot = {
  financialAccountId: string
  type: string
  amount: string
  description: string | null
  date: string
  payeeId: string | null
  categoryId: string | null
  transferGroupId: string | null
  tagIds: string[]
  attachmentIds: string[]
  reconciliationStatus: string
}

export function buildTransactionActivitySnapshot(input: {
  financialAccountId: string
  type: string
  amount: { toString(): string } | string
  description: string | null
  date: Date | string
  payeeId: string | null
  categoryId: string | null
  transferGroupId: string | null
  tagIds: string[]
  attachmentIds: string[]
  reconciliationStatus?: string | null
}): TransactionActivitySnapshot {
  const date =
    input.date instanceof Date ? input.date.toISOString() : input.date
  return {
    financialAccountId: input.financialAccountId,
    type: input.type,
    amount:
      typeof input.amount === 'string' ? input.amount : input.amount.toString(),
    description: input.description,
    date,
    payeeId: input.payeeId,
    categoryId: input.categoryId,
    transferGroupId: input.transferGroupId,
    tagIds: sortedIdList(input.tagIds),
    attachmentIds: sortedIdList(input.attachmentIds),
    reconciliationStatus: input.reconciliationStatus ?? 'UNCLEARED',
  }
}
