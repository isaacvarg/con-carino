import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import {
  assertAllowedContentType,
  assertUploadSize,
  deriveThumbnailKey,
} from '#/lib/attachment-types'
import type { DocumentListItem, DocumentTypeRecord } from '#/lib/document-types'
import { buildSignedFileUrl } from '#/lib/file-tokens'
import { prisma } from '#/lib/prisma'
import { assertObjectKeyOwnedByUser, getBucketName } from '#/lib/storage'
import {
  optionalString,
  requireHexColor,
  requireId,
  requireName,
} from '#/lib/validators'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

export type { DocumentListItem, DocumentTypeRecord } from '#/lib/document-types'

const DOCUMENT_TYPE_SELECT = {
  id: true,
  name: true,
  description: true,
  bgColor: true,
  textColor: true,
  sortOrder: true,
} as const

const DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  storageKey: true,
  thumbnailKey: true,
  createdAt: true,
  type: {
    select: {
      id: true,
      name: true,
      bgColor: true,
      textColor: true,
    },
  },
} as const

type DocumentRow = {
  id: string
  name: string
  fileName: string
  contentType: string
  byteSize: number
  storageKey: string
  thumbnailKey: string | null
  createdAt: Date
  type: {
    id: string
    name: string
    bgColor: string
    textColor: string
  }
}

const DEFAULT_DOCUMENT_TYPES = [
  {
    name: 'Statement',
    description: 'Bank and credit card statements.',
    bgColor: '#0ea5e9',
    textColor: '#ffffff',
    sortOrder: 0,
  },
  {
    name: 'Invoice',
    description: 'Bills and invoices received.',
    bgColor: '#f59e0b',
    textColor: '#ffffff',
    sortOrder: 1,
  },
  {
    name: 'Medical',
    description: 'Medical records and explanations of benefits.',
    bgColor: '#ef4444',
    textColor: '#ffffff',
    sortOrder: 2,
  },
  {
    name: 'Legal',
    description: 'Contracts, deeds, and legal filings.',
    bgColor: '#8b5cf6',
    textColor: '#ffffff',
    sortOrder: 3,
  },
  {
    name: 'Insurance',
    description: 'Policies and coverage documents.',
    bgColor: '#10b981',
    textColor: '#ffffff',
    sortOrder: 4,
  },
  {
    name: 'Other',
    description: 'Anything that does not fit another type.',
    bgColor: '#64748b',
    textColor: '#ffffff',
    sortOrder: 5,
  },
] as const

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage documents.')
  }
  return userId
}

/**
 * The migration seeds these, but fresh and test databases need them too —
 * a document cannot be created without a type to assign it.
 */
async function ensureDefaultDocumentTypes() {
  for (const type of DEFAULT_DOCUMENT_TYPES) {
    await prisma.documentType.upsert({
      where: { name: type.name },
      create: type,
      update: {},
    })
  }
}

function toDocumentListItem(row: DocumentRow): DocumentListItem {
  const bucket = getBucketName()
  return {
    id: row.id,
    name: row.name,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
    type: row.type,
    fileUrl: buildSignedFileUrl(bucket, row.storageKey),
    thumbnailUrl: row.thumbnailKey
      ? buildSignedFileUrl(bucket, row.thumbnailKey)
      : null,
  }
}

// --- Document types ---

export const listDocumentTypes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DocumentTypeRecord[]> => {
    await requireUserId()
    await ensureDefaultDocumentTypes()
    return prisma.documentType.findMany({
      select: DOCUMENT_TYPE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  },
)

export const createDocumentType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return {
      name: requireName(input.name),
      description: optionalString(input.description),
      bgColor: requireHexColor(input.bgColor, 'Background color'),
      textColor: requireHexColor(input.textColor, 'Text color'),
    }
  })
  .handler(async ({ data }): Promise<DocumentTypeRecord> => {
    const userId = await requireUserId()
    await ensureDefaultDocumentTypes()

    const existing = await prisma.documentType.findUnique({
      where: { name: data.name },
      select: { id: true },
    })
    if (existing) {
      throw new Error('A document type with that name already exists.')
    }

    const max = await prisma.documentType.aggregate({
      _max: { sortOrder: true },
    })
    const created = await prisma.documentType.create({
      data: {
        name: data.name,
        description: data.description,
        bgColor: data.bgColor,
        textColor: data.textColor,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
      select: DOCUMENT_TYPE_SELECT,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.document_type,
      entityId: created.id,
      summary: `Created document type ${created.name}`,
      changes: createChanges(created, [
        'name',
        'description',
        'bgColor',
        'textColor',
        'sortOrder',
      ]),
      visibilityUserId: null,
    })
    return created
  })

export const updateDocumentType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return {
      id: requireId(input.id),
      name: requireName(input.name),
      description: optionalString(input.description),
      bgColor: requireHexColor(input.bgColor, 'Background color'),
      textColor: requireHexColor(input.textColor, 'Text color'),
    }
  })
  .handler(async ({ data }): Promise<DocumentTypeRecord> => {
    const userId = await requireUserId()

    const clash = await prisma.documentType.findFirst({
      where: { name: data.name, id: { not: data.id } },
      select: { id: true },
    })
    if (clash) {
      throw new Error('A document type with that name already exists.')
    }

    const before = await prisma.documentType.findUniqueOrThrow({
      where: { id: data.id },
      select: DOCUMENT_TYPE_SELECT,
    })
    const updated = await prisma.documentType.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description,
        bgColor: data.bgColor,
        textColor: data.textColor,
      },
      select: DOCUMENT_TYPE_SELECT,
    })

    const changes = diffChanges(before, updated, [
      'name',
      'description',
      'bgColor',
      'textColor',
    ])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.document_type,
        entityId: updated.id,
        summary: `Updated document type ${updated.name}`,
        changes,
        visibilityUserId: null,
      })
    }
    return updated
  })

// --- Documents ---

export const listDocuments = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DocumentListItem[]> => {
    await requireUserId()
    const rows = await prisma.document.findMany({
      select: DOCUMENT_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toDocumentListItem)
  },
)

export const getDocument = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return { id: requireId(input.id) }
  })
  .handler(async ({ data }): Promise<DocumentListItem> => {
    await requireUserId()
    const row = await prisma.document.findUniqueOrThrow({
      where: { id: data.id },
      select: DOCUMENT_SELECT,
    })
    return toDocumentListItem(row)
  })

export const createDocument = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>

    const storageKey =
      typeof input.storageKey === 'string' ? input.storageKey.trim() : ''
    const fileName =
      typeof input.fileName === 'string' ? input.fileName.trim() : ''
    if (!storageKey || !fileName) {
      throw new Error('A document needs a storage key and file name.')
    }

    const contentType =
      typeof input.contentType === 'string' ? input.contentType.trim() : ''
    const byteSize =
      typeof input.byteSize === 'number'
        ? input.byteSize
        : typeof input.byteSize === 'string'
          ? Number(input.byteSize)
          : NaN
    assertAllowedContentType(contentType)
    assertUploadSize(byteSize)

    // Thumbnail keys are derived server-side (see deriveThumbnailKey); the
    // client may only echo that exact value back, or null when generation
    // failed. Anything else is a forged key.
    const rawThumbnailKey =
      typeof input.thumbnailKey === 'string' ? input.thumbnailKey.trim() : null
    const thumbnailKey = rawThumbnailKey || null
    if (thumbnailKey !== null && thumbnailKey !== deriveThumbnailKey(storageKey)) {
      throw new Error('Invalid document thumbnail key.')
    }

    return {
      name: requireName(input.name),
      documentTypeId: requireId(input.documentTypeId),
      storageKey,
      thumbnailKey,
      fileName,
      contentType,
      byteSize,
    }
  })
  .handler(async ({ data }): Promise<DocumentListItem> => {
    const userId = await requireUserId()
    assertObjectKeyOwnedByUser(data.storageKey, userId)

    const created = await prisma.document.create({
      data: {
        userId,
        documentTypeId: data.documentTypeId,
        name: data.name,
        storageKey: data.storageKey,
        thumbnailKey: data.thumbnailKey,
        fileName: data.fileName,
        contentType: data.contentType,
        byteSize: data.byteSize,
      },
      select: DOCUMENT_SELECT,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.document,
      entityId: created.id,
      summary: `Uploaded document ${created.name}`,
      changes: createChanges(
        { name: created.name, documentTypeId: data.documentTypeId },
        ['name', 'documentTypeId'],
      ),
      visibilityUserId: null,
    })
    return toDocumentListItem(created)
  })

export const updateDocument = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return {
      id: requireId(input.id),
      name: requireName(input.name),
      documentTypeId: requireId(input.documentTypeId),
    }
  })
  .handler(async ({ data }): Promise<DocumentListItem> => {
    const userId = await requireUserId()

    const before = await prisma.document.findUniqueOrThrow({
      where: { id: data.id },
      select: { name: true, documentTypeId: true },
    })
    const updated = await prisma.document.update({
      where: { id: data.id },
      data: {
        name: data.name,
        documentTypeId: data.documentTypeId,
      },
      select: DOCUMENT_SELECT,
    })

    const changes = diffChanges(
      before,
      { name: updated.name, documentTypeId: updated.type.id },
      ['name', 'documentTypeId'],
    )
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.document,
        entityId: updated.id,
        summary: `Updated document ${updated.name}`,
        changes,
        visibilityUserId: null,
      })
    }
    return toDocumentListItem(updated)
  })
