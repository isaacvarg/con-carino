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

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

function parseCsvParam(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',')
}

export function parseCsvValues(value: string): string[] {
  if (!value.trim()) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function serializeCsvValues(values: string[]): string {
  return values.filter(Boolean).join(',')
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
