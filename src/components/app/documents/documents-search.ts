import { parseCsvParam } from '#/lib/search-params'

export const documentsSearchDefaults = {
  q: '',
  type: '',
} as const

export type DocumentsSearch = {
  q: string
  /** CSV of selected document type ids. */
  type: string
}

export function validateDocumentsSearch(
  search: Record<string, unknown>,
): DocumentsSearch {
  return {
    q: typeof search.q === 'string' ? search.q : documentsSearchDefaults.q,
    type: parseCsvParam(search.type),
  }
}
