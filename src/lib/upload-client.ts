import type { AttachmentUploadMeta } from '#/lib/attachment-types'

/**
 * POSTs a single file to the upload endpoint and returns its stored metadata.
 * Nothing is persisted here — the caller creates the DB row and the server
 * re-validates the metadata before trusting it.
 */
export async function uploadFile(file: File): Promise<AttachmentUploadMeta> {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch('/api/uploads', {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(
      body?.error ?? `Failed to upload "${file.name}" (${response.status}).`,
    )
  }

  const { attachment } = (await response.json()) as {
    attachment: AttachmentUploadMeta
  }
  return attachment
}
