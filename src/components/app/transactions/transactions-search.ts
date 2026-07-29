import { ACCOUNT_TYPE_OPTIONS } from '#/components/app/accounts/account-utils'
import {
  parseCsvParam,
  parsePositiveInt,
  serializeCsvValues,
} from '#/lib/search-params'

export { parseCsvValues, serializeCsvValues } from '#/lib/search-params'

/** Virtual accounts are bookkeeping envelopes, so they stay out of the
 * transactions list until the user ticks them back on. */
const DEFAULT_ACCOUNT_TYPES = serializeCsvValues(
  ACCOUNT_TYPE_OPTIONS.filter((option) => option.value !== 'VIRTUAL').map(
    (option) => option.value,
  ),
)

export const transactionsSearchDefaults = {
  page: 1,
  pageSize: 10,
  sort: '-date',
  q: '',
  cols: '',
  account: '',
  accountType: DEFAULT_ACCOUNT_TYPES,
  type: '',
  category: '',
  payee: '',
  tags: '',
  week: '',
} as const

export type TransactionsSearch = {
  page: number
  pageSize: number
  sort: string
  q: string
  cols: string
  account: string
  /** CSV of selected `AccountType` values. */
  accountType: string
  type: string
  category: string
  payee: string
  tags: string
  /** CSV of week start dates (YYYY-MM-DD), or the "unfiled" sentinel. */
  week: string
}

export function validateTransactionsSearch(
  search: Record<string, unknown>,
): TransactionsSearch {
  return {
    page: parsePositiveInt(search.page, transactionsSearchDefaults.page),
    pageSize: parsePositiveInt(
      search.pageSize,
      transactionsSearchDefaults.pageSize,
    ),
    sort:
      typeof search.sort === 'string' && search.sort
        ? search.sort
        : transactionsSearchDefaults.sort,
    q: typeof search.q === 'string' ? search.q : transactionsSearchDefaults.q,
    cols:
      typeof search.cols === 'string'
        ? search.cols
        : transactionsSearchDefaults.cols,
    account: parseCsvParam(search.account),
    // Absent means "first visit" and gets the default; an explicit empty string
    // means the user cleared the facet and wants every account type.
    accountType:
      typeof search.accountType === 'string'
        ? parseCsvParam(search.accountType)
        : transactionsSearchDefaults.accountType,
    type: parseCsvParam(search.type),
    category: parseCsvParam(search.category),
    payee: parseCsvParam(search.payee),
    tags: parseCsvParam(search.tags),
    week: parseCsvParam(search.week),
  }
}
