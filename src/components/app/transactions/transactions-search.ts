import { parseCsvParam, parsePositiveInt } from '#/lib/search-params'

export { parseCsvValues, serializeCsvValues } from '#/lib/search-params'

export const transactionsSearchDefaults = {
  page: 1,
  pageSize: 10,
  sort: '-date',
  q: '',
  cols: '',
  account: '',
  type: '',
  category: '',
  payee: '',
  tags: '',
} as const

export type TransactionsSearch = {
  page: number
  pageSize: number
  sort: string
  q: string
  cols: string
  account: string
  type: string
  category: string
  payee: string
  tags: string
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
    type: parseCsvParam(search.type),
    category: parseCsvParam(search.category),
    payee: parseCsvParam(search.payee),
    tags: parseCsvParam(search.tags),
  }
}
