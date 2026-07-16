export const MAX_ATTACHMENTS_PER_TXN = 5

/** 10 MiB */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number]

export const CONTENT_TYPE_EXTENSIONS: Record<AllowedContentType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type AttachmentUploadMeta = {
  storageKey: string
  thumbnailKey: string | null
  fileName: string
  contentType: string
  byteSize: number
}

export type AttachmentListItem = {
  id: string
  fileName: string
  contentType: string
  byteSize: number
  storageKey: string
  thumbnailKey: string | null
  /** Same-origin signed URL for the full file (see src/lib/file-tokens.ts). */
  fileUrl: string
  /** Same-origin signed URL for the thumbnail, when one was generated. */
  thumbnailUrl: string | null
}

/**
 * The thumbnail key is derived from the storage key rather than supplied by
 * the client, so the server never has to trust a client-sent key and the
 * `${userId}/` ownership prefix carries over automatically.
 */
export function deriveThumbnailKey(storageKey: string): string {
  return storageKey.replace(/\.[^./]+$/, '') + '.thumb.webp'
}

export function isAllowedContentType(
  contentType: string,
): contentType is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)
}

export function assertAllowedContentType(
  contentType: string,
): AllowedContentType {
  if (!isAllowedContentType(contentType)) {
    throw new Error(
      `Unsupported file type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}.`,
    )
  }
  return contentType
}

export function assertUploadSize(contentLength: number): void {
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error('File size must be a positive number.')
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File exceeds maximum size of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB.`,
    )
  }
}
