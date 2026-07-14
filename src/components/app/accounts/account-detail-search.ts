export const accountDetailSearchDefaults = {
  page: 1,
  pageSize: 10,
  sort: '-date',
  q: '',
  cols: '',
} as const

export type AccountTransactionsSearch = {
  page: number
  pageSize: number
  sort: string
  q: string
  cols: string
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

export function validateAccountTransactionsSearch(
  search: Record<string, unknown>,
): AccountTransactionsSearch {
  return {
    page: parsePositiveInt(search.page, accountDetailSearchDefaults.page),
    pageSize: parsePositiveInt(
      search.pageSize,
      accountDetailSearchDefaults.pageSize,
    ),
    sort:
      typeof search.sort === 'string' && search.sort
        ? search.sort
        : accountDetailSearchDefaults.sort,
    q: typeof search.q === 'string' ? search.q : accountDetailSearchDefaults.q,
    cols:
      typeof search.cols === 'string'
        ? search.cols
        : accountDetailSearchDefaults.cols,
  }
}
