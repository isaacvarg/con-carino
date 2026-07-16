import Fuse, { type IFuseOptions } from 'fuse.js'
import {
  formatAccountCurrency,
  formatTransactionDate,
  transactionTypeLabel,
} from '#/components/app/accounts/account-utils'
import type { TransactionType } from '#/generated/prisma/enums'

export const TRANSACTION_SEARCH_KEYS = [
  'date',
  'account',
  'type',
  'payee',
  'category',
  'tags',
  'description',
  'amount',
] as const

export type TransactionSearchKey = (typeof TRANSACTION_SEARCH_KEYS)[number]

type TaxonomyName = { name: string }

export type TransactionSearchable = {
  id: string
  type: TransactionType
  amount: string
  description: string | null
  date: string
  payee: TaxonomyName | null
  category: TaxonomyName | null
  tags: TaxonomyName[]
  account?: { name: string } | null
}

export type TransactionSearchDoc = {
  id: string
  date: string
  account: string
  type: string
  payee: string
  category: string
  tags: string
  description: string
  amount: string
}

function fuseOptions(keys: TransactionSearchKey[]): IFuseOptions<TransactionSearchDoc> {
  return {
    keys,
    threshold: 0.4,
    // Match anywhere in the field, not just near the start.
    ignoreLocation: true,
  }
}

export function toTransactionSearchDoc(
  row: TransactionSearchable,
): TransactionSearchDoc {
  const amountRaw = String(row.amount)
  return {
    id: row.id,
    date: formatTransactionDate(row.date),
    account: row.account?.name?.trim() ?? '',
    type: transactionTypeLabel(row.type),
    payee: row.payee?.name?.trim() ?? '',
    category: row.category?.name?.trim() ?? '',
    tags: row.tags.map((tag) => tag.name).join(', '),
    description: row.description?.trim() ?? '',
    // Include formatted currency and raw number so both "$12.34" and "12.34" match.
    amount: `${formatAccountCurrency(amountRaw)} ${amountRaw}`,
  }
}

export function createTransactionSearchIndex(
  docs: TransactionSearchDoc[],
  keys: readonly TransactionSearchKey[],
): Fuse<TransactionSearchDoc> {
  return new Fuse(docs, fuseOptions([...keys]))
}

/**
 * Fuzzy-filter transactions by the given column keys. An empty query or empty
 * key list returns `rows` untouched.
 */
export function searchTransactions<T extends TransactionSearchable>(
  rows: T[],
  keys: readonly TransactionSearchKey[],
  query: string,
): T[] {
  const trimmed = query.trim()
  if (!trimmed || keys.length === 0) return rows

  const docs = rows.map(toTransactionSearchDoc)
  const index = createTransactionSearchIndex(docs, keys)
  const matchedIds = new Set(index.search(trimmed).map((result) => result.item.id))
  return rows.filter((row) => matchedIds.has(row.id))
}

/**
 * Returns matching transaction ids for TanStack Table's globalFilterFn.
 * `null` means “no global filter” (empty query or no keys).
 */
export function searchTransactionIds(
  rows: readonly TransactionSearchable[],
  keys: readonly TransactionSearchKey[],
  query: string,
): Set<string> | null {
  const trimmed = query.trim()
  if (!trimmed || keys.length === 0) return null

  const docs = rows.map(toTransactionSearchDoc)
  const index = createTransactionSearchIndex(docs, keys)
  return new Set(index.search(trimmed).map((result) => result.item.id))
}
