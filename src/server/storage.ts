import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { assertObjectKeyOwnedByUser, deleteObject } from '#/lib/storage'
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
