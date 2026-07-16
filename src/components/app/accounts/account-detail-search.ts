export const accountDetailSearchDefaults = {
  page: 1,
  pageSize: 10,
  sort: '-date',
  q: '',
  cols: '',
  type: '',
  category: '',
  payee: '',
  tags: '',
  mode: '',
  reconView: 'list',
} as const

export type AccountReconView = 'list' | 'review'

export type AccountTransactionsSearch = {
  page: number
  pageSize: number
  sort: string
  q: string
  cols: string
  type: string
  category: string
  payee: string
  tags: string
  mode: '' | 'reconcile'
  reconView: AccountReconView
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

function parseMode(value: unknown): '' | 'reconcile' {
  return value === 'reconcile' ? 'reconcile' : ''
}

function parseReconView(value: unknown): AccountReconView {
  return value === 'review' ? 'review' : 'list'
}

function parseCsvParam(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',')
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
    type: parseCsvParam(search.type),
    category: parseCsvParam(search.category),
    payee: parseCsvParam(search.payee),
    tags: parseCsvParam(search.tags),
    mode: parseMode(search.mode),
    reconView: parseReconView(search.reconView),
  }
}
