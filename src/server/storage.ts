import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import {
  assertAllowedContentType,
  assertObjectKeyOwnedByUser,
  assertUploadSize,
  buildObjectKey,
  deleteObject,
  ensureBucket,
  MAX_UPLOAD_BYTES,
  ALLOWED_CONTENT_TYPES,
  presignGetObject,
  presignPutObject,
  type AllowedContentType,
} from '#/lib/storage'
import { authConfig } from '#/utils/auth'

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage files.')
  }
  return userId
}

export type CreateUploadUrlInput = {
  contentType: AllowedContentType
  contentLength: number
}

export type CreateUploadUrlResult = {
  key: string
  uploadUrl: string
  maxBytes: number
  allowedContentTypes: readonly string[]
}

export type CreateDownloadUrlResult = {
  downloadUrl: string
}

export const createUploadUrl = createServerFn({ method: 'POST' })
  .validator((data: unknown): CreateUploadUrlInput => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    const contentType =
      typeof input.contentType === 'string' ? input.contentType : ''
    const contentLength =
      typeof input.contentLength === 'number'
        ? input.contentLength
        : typeof input.contentLength === 'string'
          ? Number(input.contentLength)
          : NaN

    assertAllowedContentType(contentType)
    assertUploadSize(contentLength)

    return {
      contentType: contentType as AllowedContentType,
      contentLength,
    }
  })
  .handler(async ({ data }): Promise<CreateUploadUrlResult> => {
    const userId = await requireUserId()
    await ensureBucket()

    const key = buildObjectKey(userId, data.contentType)
    const uploadUrl = await presignPutObject({
      key,
      contentType: data.contentType,
      contentLength: data.contentLength,
    })

    return {
      key,
      uploadUrl,
      maxBytes: MAX_UPLOAD_BYTES,
      allowedContentTypes: ALLOWED_CONTENT_TYPES,
    }
  })

export const createDownloadUrl = createServerFn({ method: 'POST' })
  .validator((data: unknown): { key: string } => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const key =
      typeof (data as Record<string, unknown>).key === 'string'
        ? (data as { key: string }).key.trim()
        : ''
    if (!key) {
      throw new Error('Object key is required.')
    }
    return { key }
  })
  .handler(async ({ data }): Promise<CreateDownloadUrlResult> => {
    const userId = await requireUserId()
    assertObjectKeyOwnedByUser(data.key, userId)
    const downloadUrl = await presignGetObject(data.key)
    return { downloadUrl }
  })

export const deleteStoredObject = createServerFn({ method: 'POST' })
  .validator((data: unknown): { key: string } => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const key =
      typeof (data as Record<string, unknown>).key === 'string'
        ? (data as { key: string }).key.trim()
        : ''
    if (!key) {
      throw new Error('Object key is required.')
    }
    return { key }
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const userId = await requireUserId()
    assertObjectKeyOwnedByUser(data.key, userId)
    await deleteObject(data.key)
    return { ok: true }
  })
