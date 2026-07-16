import Fuse, { type IFuseOptions } from 'fuse.js'

export const DOCUMENT_SEARCH_KEYS = ['name', 'fileName', 'type'] as const

export type DocumentSearchKey = (typeof DOCUMENT_SEARCH_KEYS)[number]

export type DocumentSearchable = {
  id: string
  name: string
  fileName: string
  type: { name: string }
}

export type DocumentSearchDoc = {
  id: string
  name: string
  fileName: string
  type: string
}

const FUSE_OPTIONS: IFuseOptions<DocumentSearchDoc> = {
  keys: [...DOCUMENT_SEARCH_KEYS],
  threshold: 0.4,
  // Match anywhere in the field, not just near the start.
  ignoreLocation: true,
}

export function toDocumentSearchDoc(row: DocumentSearchable): DocumentSearchDoc {
  return {
    id: row.id,
    name: row.name.trim(),
    fileName: row.fileName.trim(),
    type: row.type.name.trim(),
  }
}

export function createDocumentSearchIndex(
  docs: DocumentSearchDoc[],
): Fuse<DocumentSearchDoc> {
  return new Fuse(docs, FUSE_OPTIONS)
}

/**
 * Fuzzy-filter documents by name, file name, and type. An empty query returns
 * `rows` untouched.
 */
export function searchDocuments<T extends DocumentSearchable>(
  rows: T[],
  query: string,
): T[] {
  const trimmed = query.trim()
  if (!trimmed) return rows

  const index = createDocumentSearchIndex(rows.map(toDocumentSearchDoc))
  const matchedIds = new Set(index.search(trimmed).map((result) => result.item.id))
  return rows.filter((row) => matchedIds.has(row.id))
}

/**
 * Returns matching document ids. `null` means “no search filter” (empty query).
 */
export function searchDocumentIds(
  rows: readonly DocumentSearchable[],
  query: string,
): Set<string> | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  const index = createDocumentSearchIndex(rows.map(toDocumentSearchDoc))
  return new Set(index.search(trimmed).map((result) => result.item.id))
}
