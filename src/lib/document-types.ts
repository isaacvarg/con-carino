import type { TaxonomyListItem } from '#/lib/taxonomy-types'

/**
 * Unlike the transaction taxonomies, document type colors are required — a
 * type always paints its badge.
 */
export type DocumentTypeRecord = TaxonomyListItem & {
  description: string | null
  bgColor: string
  textColor: string
  sortOrder: number
}

/** The type reference carried on a document, enough to paint its badge. */
export type DocumentTypeRef = TaxonomyListItem & {
  bgColor: string
  textColor: string
}

export type DocumentListItem = {
  id: string
  name: string
  fileName: string
  contentType: string
  byteSize: number
  /** ISO 8601. */
  createdAt: string
  type: DocumentTypeRef
  /** Same-origin signed URL for the full file (see src/lib/file-tokens.ts). */
  fileUrl: string
  /** Same-origin signed URL for the thumbnail, when one was generated. */
  thumbnailUrl: string | null
}

export const DEFAULT_DOCUMENT_TYPE_BG_COLOR = '#0ea5e9'
export const DEFAULT_DOCUMENT_TYPE_TEXT_COLOR = '#ffffff'
