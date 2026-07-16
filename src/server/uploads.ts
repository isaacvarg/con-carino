import { getSession } from 'start-authjs'
import {
  assertAllowedContentType,
  deriveThumbnailKey,
  MAX_UPLOAD_BYTES,
  type AttachmentUploadMeta,
} from '#/lib/attachment-types'
import { buildObjectKey, putObject } from '#/lib/storage'
import { generateThumbnail } from '#/server/thumbnails'
import { authConfig } from '#/utils/auth'


function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

// Multipart framing overhead on top of the file bytes themselves.
const FORM_OVERHEAD_BYTES = 8 * 1024

export async function handleUpload(request: Request): Promise<Response> {
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    return jsonError(401, 'You must be signed in to upload files.')
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES
  ) {
    return jsonError(413, 'File exceeds the maximum upload size.')
  }

  let file: File
  try {
    const form = await request.formData()
    const entry = form.get('file')
    if (!(entry instanceof File)) {
      return jsonError(400, 'Expected a single "file" form field.')
    }
    file = entry
  } catch {
    return jsonError(400, 'Invalid multipart form data.')
  }

  let contentType
  try {
    contentType = assertAllowedContentType(file.type)
  } catch (error) {
    return jsonError(415, error instanceof Error ? error.message : 'Unsupported file type.')
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return jsonError(413, 'File exceeds the maximum upload size.')
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const storageKey = buildObjectKey(userId, contentType)
    await putObject({ key: storageKey, body: bytes, contentType })

    let thumbnailKey: string | null = null
    const thumbnail = await generateThumbnail(bytes, contentType)
    if (thumbnail) {
      thumbnailKey = deriveThumbnailKey(storageKey)
      try {
        await putObject({
          key: thumbnailKey,
          body: thumbnail,
          contentType: 'image/webp',
        })
      } catch (error) {
        console.warn('Failed to store thumbnail:', error)
        thumbnailKey = null
      }
    }

    const attachment: AttachmentUploadMeta = {
      storageKey,
      thumbnailKey,
      fileName: file.name,
      contentType,
      byteSize: bytes.byteLength,
    }
    return Response.json({ attachment })
  } catch (error) {
    console.error('Upload failed:', error)
    return jsonError(500, 'Upload failed. Please try again.')
  }
}
