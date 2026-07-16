import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import {
  ReconciliationStatus as ReconciliationStatusEnum,
  TransactionType as TransactionTypeEnum,
} from '#/generated/prisma/enums'
import type {
  ReconciliationStatus,
  TransactionType,
} from '#/generated/prisma/enums'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import {
  assertAllowedContentType,
  assertUploadSize,
  deriveThumbnailKey,
  MAX_ATTACHMENTS_PER_TXN,
  type AttachmentListItem,
  type AttachmentUploadMeta,
} from '#/lib/attachment-types'
import { buildSignedFileUrl } from '#/lib/file-tokens'
import { prisma } from '#/lib/prisma'
import {
  assertObjectKeyOwnedByUser,
  deleteObject,
  getBucketName,
} from '#/lib/storage'
import {
  TAXONOMY_COLOR_SELECT,
  type ColoredTaxonomyRef,
} from '#/lib/taxonomy-types'
import {
  toSignedTransactionAmount,
  transactionTypeNeedsDirection,
  type TransactionDirection,
} from '#/lib/transaction-amount'
import {
  assertCanMutateReconciliationStatus,
  isMutableReconciliationStatus,
  reconciliationStatusActivitySummary,
  type MutableReconciliationStatus,
} from '#/lib/reconciliation'
import {
  buildTransactionActivitySnapshot,
  directionFromSignedAmount,
  planAttachmentChanges,
  TRANSACTION_UPDATE_ACTIVITY_FIELDS,
} from '#/lib/transaction-edit'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

const TRANSACTION_ACTIVITY_FIELDS = [
  'financialAccountId',
  'type',
  'amount',
  'description',
  'date',
  'payeeId',
  'categoryId',
  'transferGroupId',
] as const

const TRANSACTION_TYPES = Object.values(TransactionTypeEnum)

type TaxonomyRef = {
  id: string
  name: string
}

export type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'

const ATTACHMENT_SELECT = {
  id: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  storageKey: true,
  thumbnailKey: true,
} as const

export type ReconciliationActorRef = {
  id: string
  name: string | null
}

export type TransactionListItem = {
  id: string
  userId: string
  financialAccountId: string
  type: TransactionType
  amount: string
  description: string | null
  date: string
  payee: TaxonomyRef | null
  category: TaxonomyRef | null
  tags: TaxonomyRef[]
  attachments: AttachmentListItem[]
  reconciliationStatus: ReconciliationStatus
  reconciliationUpdatedAt: string | null
  reconciliationUpdatedBy: ReconciliationActorRef | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value)
}

async function resolvePayeeId(
  value: string | null | undefined,
): Promise<string | null> {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null

  if (looksLikeUuid(trimmed)) {
    const existing = await prisma.payee.findUnique({
      where: { id: trimmed },
      select: { id: true },
    })
    if (!existing) {
      throw new Error('Payee not found.')
    }
    return existing.id
  }

  const byName = await prisma.payee.findFirst({
    where: { name: trimmed },
    select: { id: true },
  })
  if (byName) return byName.id

  const created = await prisma.payee.create({
    data: { name: trimmed },
    select: { id: true },
  })
  return created.id
}

async function resolveCategoryId(
  value: string | null | undefined,
): Promise<string | null> {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null

  if (looksLikeUuid(trimmed)) {
    const existing = await prisma.category.findUnique({
      where: { id: trimmed },
      select: { id: true },
    })
    if (!existing) {
      throw new Error('Category not found.')
    }
    return existing.id
  }

  const byName = await prisma.category.findFirst({
    where: { name: trimmed },
    select: { id: true },
  })
  if (byName) return byName.id

  const created = await prisma.category.create({
    data: { name: trimmed, isExpenditure: true },
    select: { id: true },
  })
  return created.id
}

async function resolveTagIds(
  values: string[] | null | undefined,
): Promise<string[]> {
  if (!values?.length) return []

  const seen = new Set<string>()
  const ids: string[] = []

  for (const raw of values) {
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue

    if (looksLikeUuid(trimmed)) {
      const existing = await prisma.tag.findUnique({
        where: { id: trimmed },
        select: { id: true, name: true },
      })
      if (!existing) {
        throw new Error('Tag not found.')
      }
      if (seen.has(existing.name.toLowerCase())) continue
      seen.add(existing.name.toLowerCase())
      ids.push(existing.id)
      continue
    }

    seen.add(trimmed.toLowerCase())
    const byName = await prisma.tag.findFirst({
      where: { name: trimmed },
      select: { id: true },
    })
    if (byName) {
      ids.push(byName.id)
      continue
    }

    const created = await prisma.tag.create({
      data: { name: trimmed },
      select: { id: true },
    })
    ids.push(created.id)
  }

  return ids
}

export type VisibleTransactionListItem = TransactionListItem & {
  account: {
    id: string
    name: string
    isGlobal: boolean
  }
}

export type TransactionDetailDto = Omit<
  VisibleTransactionListItem,
  'payee' | 'category' | 'tags'
> & {
  payee: ColoredTaxonomyRef | null
  category: ColoredTaxonomyRef | null
  tags: ColoredTaxonomyRef[]
  transferGroupId: string | null
  createdAt: string
  updatedAt: string
  transferCounterpart: {
    id: string
    financialAccountId: string
    accountName: string
    amount: string
  } | null
  careInvoice: {
    id: string
    status: string
  } | null
}

type AttachmentRef = {
  id: string
  fileName: string
  contentType: string
  byteSize: number
  storageKey: string
  thumbnailKey: string | null
}

type TransactionWithTaxonomies = {
  id: string
  userId: string
  financialAccountId: string
  type: TransactionType
  amount: { toString(): string }
  description: string | null
  date: Date
  payee: TaxonomyRef | null
  category: TaxonomyRef | null
  tags: TaxonomyRef[]
  attachments?: AttachmentRef[]
  reconciliationStatus: ReconciliationStatus
  reconciliationUpdatedAt: Date | null
  reconciliationUpdatedBy?: ReconciliationActorRef | null
}

type TransactionWithAccount = TransactionWithTaxonomies & {
  financialAccount: {
    id: string
    name: string
    isGlobal: boolean
  }
}

function toAttachmentListItem(attachment: AttachmentRef): AttachmentListItem {
  const bucket = getBucketName()
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    storageKey: attachment.storageKey,
    thumbnailKey: attachment.thumbnailKey,
    fileUrl: buildSignedFileUrl(bucket, attachment.storageKey),
    thumbnailUrl: attachment.thumbnailKey
      ? buildSignedFileUrl(bucket, attachment.thumbnailKey)
      : null,
  }
}

function toTransactionListItem(
  txn: TransactionWithTaxonomies,
): TransactionListItem {
  return {
    id: txn.id,
    userId: txn.userId,
    financialAccountId: txn.financialAccountId,
    type: txn.type,
    amount: txn.amount.toString(),
    description: txn.description,
    date: txn.date.toISOString(),
    payee: txn.payee ? { id: txn.payee.id, name: txn.payee.name } : null,
    category: txn.category
      ? { id: txn.category.id, name: txn.category.name }
      : null,
    tags: txn.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    attachments: (txn.attachments ?? []).map(toAttachmentListItem),
    reconciliationStatus: txn.reconciliationStatus,
    reconciliationUpdatedAt: txn.reconciliationUpdatedAt
      ? txn.reconciliationUpdatedAt.toISOString()
      : null,
    reconciliationUpdatedBy: txn.reconciliationUpdatedBy
      ? {
          id: txn.reconciliationUpdatedBy.id,
          name: txn.reconciliationUpdatedBy.name,
        }
      : null,
  }
}

function toVisibleTransactionListItem(
  txn: TransactionWithAccount,
): VisibleTransactionListItem {
  return {
    ...toTransactionListItem(txn),
    account: {
      id: txn.financialAccount.id,
      name: txn.financialAccount.name,
      isGlobal: txn.financialAccount.isGlobal,
    },
  }
}

function emptyTaxonomies() {
  return {
    payee: null as TaxonomyRef | null,
    category: null as TaxonomyRef | null,
    tags: [] as TaxonomyRef[],
    attachments: [] as AttachmentListItem[],
    reconciliationStatus: 'UNCLEARED' as ReconciliationStatus,
    reconciliationUpdatedAt: null as string | null,
    reconciliationUpdatedBy: null as ReconciliationActorRef | null,
  }
}

function parseAttachments(value: unknown): AttachmentUploadMeta[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new Error('Attachments must be an array.')
  }
  if (value.length > MAX_ATTACHMENTS_PER_TXN) {
    throw new Error(
      `You can attach at most ${MAX_ATTACHMENTS_PER_TXN} files.`,
    )
  }

  const seenKeys = new Set<string>()
  const attachments: AttachmentUploadMeta[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid attachment entry.')
    }
    const entry = item as Record<string, unknown>
    const storageKey =
      typeof entry.storageKey === 'string' ? entry.storageKey.trim() : ''
    const fileName =
      typeof entry.fileName === 'string' ? entry.fileName.trim() : ''
    const contentType =
      typeof entry.contentType === 'string' ? entry.contentType.trim() : ''
    const byteSize =
      typeof entry.byteSize === 'number'
        ? entry.byteSize
        : typeof entry.byteSize === 'string'
          ? Number(entry.byteSize)
          : NaN

    if (!storageKey || !fileName) {
      throw new Error('Each attachment needs a storage key and file name.')
    }
    assertAllowedContentType(contentType)
    assertUploadSize(byteSize)

    // Thumbnail keys are derived server-side (see deriveThumbnailKey); the
    // client may only echo that exact value back, or null when generation
    // failed. Anything else is a forged key.
    const rawThumbnailKey =
      typeof entry.thumbnailKey === 'string' ? entry.thumbnailKey.trim() : null
    const thumbnailKey = rawThumbnailKey || null
    if (thumbnailKey !== null && thumbnailKey !== deriveThumbnailKey(storageKey)) {
      throw new Error('Invalid attachment thumbnail key.')
    }

    if (seenKeys.has(storageKey)) {
      throw new Error('Duplicate attachment keys are not allowed.')
    }
    seenKeys.add(storageKey)

    attachments.push({
      storageKey,
      thumbnailKey,
      fileName,
      contentType,
      byteSize,
    })
  }

  return attachments
}

async function linkAttachments(
  userId: string,
  metas: AttachmentUploadMeta[],
  transactionIds: string[],
): Promise<AttachmentListItem[]> {
  if (metas.length === 0) {
    return []
  }
  if (transactionIds.length === 0) {
    throw new Error('At least one transaction is required to link attachments.')
  }

  for (const meta of metas) {
    assertObjectKeyOwnedByUser(meta.storageKey, userId)
    assertAllowedContentType(meta.contentType)
    assertUploadSize(meta.byteSize)
  }

  const created = await prisma.$transaction(
    metas.map((meta) =>
      prisma.attachment.create({
        data: {
          userId,
          storageKey: meta.storageKey,
          thumbnailKey: meta.thumbnailKey,
          fileName: meta.fileName,
          contentType: meta.contentType,
          byteSize: meta.byteSize,
          transactions: {
            connect: transactionIds.map((id) => ({ id })),
          },
        },
        select: {
          id: true,
          fileName: true,
          contentType: true,
          byteSize: true,
          storageKey: true,
          thumbnailKey: true,
        },
      }),
    ),
  )

  return created.map(toAttachmentListItem)
}

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage transactions.')
  }
  return userId
}

function ownOrGlobal(userId: string) {
  return {
    OR: [{ userId }, { isGlobal: true }],
  }
}

async function assertAccountVisible(userId: string, accountId: string) {
  const account = await prisma.financialAccount.findFirst({
    where: {
      AND: [{ id: accountId }, ownOrGlobal(userId)],
    },
    select: { id: true, name: true, initialBalance: true, userId: true, isGlobal: true },
  })
  if (!account) {
    throw new Error('Account not found.')
  }
  return account
}

async function assertAccountOwned(userId: string, accountId: string) {
  const account = await prisma.financialAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, name: true, userId: true, isGlobal: true },
  })
  if (!account) {
    throw new Error('Account not found.')
  }
  return account
}

function parsePositiveAmount(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Amount is required.')
  }
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a number greater than zero.')
  }
  return amount
}

function parseDate(value: string): Date {
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Date must be YYYY-MM-DD.')
  }
  const [y, m, d] = trimmed.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function parseDirection(value: unknown): TransactionDirection | undefined {
  if (value === 'in' || value === 'out') return value
  return undefined
}

export const listAccountTransactions = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const accountId =
      typeof (data as { accountId?: unknown }).accountId === 'string'
        ? (data as { accountId: string }).accountId
        : ''
    if (!accountId) {
      throw new Error('Account id is required.')
    }
    return { accountId }
  })
  .handler(async ({ data }): Promise<TransactionListItem[]> => {
    const userId = await requireUserId()
    await assertAccountVisible(userId, data.accountId)

    const transactions = await prisma.transaction.findMany({
      where: { financialAccountId: data.accountId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        attachments: {
          select: ATTACHMENT_SELECT,
          orderBy: { createdAt: 'asc' },
        },
        reconciliationUpdatedBy: { select: { id: true, name: true } },
      },
    })

    return transactions.map(toTransactionListItem)
  })

export const listVisibleTransactions = createServerFn({ method: 'GET' }).handler(
  async (): Promise<VisibleTransactionListItem[]> => {
    const userId = await requireUserId()

    const transactions = await prisma.transaction.findMany({
      where: {
        financialAccount: ownOrGlobal(userId),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        financialAccount: {
          select: { id: true, name: true, isGlobal: true },
        },
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        reconciliationUpdatedBy: { select: { id: true, name: true } },
      },
    })

    return transactions.map(toVisibleTransactionListItem)
  },
)

export const listRecentTransactions = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const takeRaw =
      typeof input.take === 'number'
        ? input.take
        : typeof input.take === 'string'
          ? Number(input.take)
          : 8
    const take = Number.isFinite(takeRaw)
      ? Math.min(Math.max(Math.floor(takeRaw), 1), 20)
      : 8
    return { take }
  })
  .handler(async ({ data }): Promise<VisibleTransactionListItem[]> => {
    const userId = await requireUserId()

    const transactions = await prisma.transaction.findMany({
      where: {
        financialAccount: ownOrGlobal(userId),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: data.take,
      include: {
        financialAccount: {
          select: { id: true, name: true, isGlobal: true },
        },
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        reconciliationUpdatedBy: { select: { id: true, name: true } },
      },
    })

    return transactions.map(toVisibleTransactionListItem)
  })

export type TaxonomyTransactionStat = {
  id: string | null
  name: string
  count: number
}

export type PayeeTransactionStat = TaxonomyTransactionStat

const STATS_TOP = 8

function capTaxonomyStats(
  stats: TaxonomyTransactionStat[],
): TaxonomyTransactionStat[] {
  const sorted = [...stats].sort((a, b) => b.count - a.count)
  if (sorted.length <= STATS_TOP) return sorted
  const head = sorted.slice(0, STATS_TOP)
  const otherCount = sorted.slice(STATS_TOP).reduce((sum, s) => sum + s.count, 0)
  return [...head, { id: null, name: 'Other', count: otherCount }]
}

export const getPayeeTransactionStats = createServerFn({
  method: 'GET',
}).handler(async (): Promise<TaxonomyTransactionStat[]> => {
  const userId = await requireUserId()

  const groups = await prisma.transaction.groupBy({
    by: ['payeeId'],
    where: {
      financialAccount: ownOrGlobal(userId),
    },
    _count: { _all: true },
  })

  const payeeIds = groups
    .map((g) => g.payeeId)
    .filter((id): id is string => typeof id === 'string')

  const payees =
    payeeIds.length > 0
      ? await prisma.payee.findMany({
          where: { id: { in: payeeIds } },
          select: { id: true, name: true },
        })
      : []
  const nameById = new Map(payees.map((p) => [p.id, p.name]))

  return capTaxonomyStats(
    groups.map((g) => ({
      id: g.payeeId,
      name: g.payeeId ? (nameById.get(g.payeeId) ?? 'Unknown') : 'No payee',
      count: g._count._all,
    })),
  )
})

export const getCategoryTransactionStats = createServerFn({
  method: 'GET',
}).handler(async (): Promise<TaxonomyTransactionStat[]> => {
  const userId = await requireUserId()

  const groups = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      financialAccount: ownOrGlobal(userId),
    },
    _count: { _all: true },
  })

  const categoryIds = groups
    .map((g) => g.categoryId)
    .filter((id): id is string => typeof id === 'string')

  const categories =
    categoryIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : []
  const nameById = new Map(categories.map((c) => [c.id, c.name]))

  return capTaxonomyStats(
    groups.map((g) => ({
      id: g.categoryId,
      name: g.categoryId
        ? (nameById.get(g.categoryId) ?? 'Unknown')
        : 'No category',
      count: g._count._all,
    })),
  )
})

export const getTagTransactionStats = createServerFn({
  method: 'GET',
}).handler(async (): Promise<TaxonomyTransactionStat[]> => {
  const userId = await requireUserId()

  const rows = await prisma.tag.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          transactions: {
            where: { financialAccount: ownOrGlobal(userId) },
          },
        },
      },
    },
  })

  const withTags = rows
    .filter((row) => row._count.transactions > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      count: row._count.transactions,
    }))

  const untagged = await prisma.transaction.count({
    where: {
      financialAccount: ownOrGlobal(userId),
      tags: { none: {} },
    },
  })

  const stats: TaxonomyTransactionStat[] = [...withTags]
  if (untagged > 0) {
    stats.push({ id: null, name: 'No tags', count: untagged })
  }

  return capTaxonomyStats(stats)
})

export const getTransaction = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const id =
      typeof (data as { id?: unknown }).id === 'string'
        ? (data as { id: string }).id.trim()
        : ''
    if (!id) {
      throw new Error('Transaction id is required.')
    }
    return { id }
  })
  .handler(async ({ data }): Promise<TransactionDetailDto> => {
    const userId = await requireUserId()

    const txn = await prisma.transaction.findFirst({
      where: {
        id: data.id,
        financialAccount: ownOrGlobal(userId),
      },
      include: {
        financialAccount: {
          select: { id: true, name: true, isGlobal: true, userId: true },
        },
        payee: { select: TAXONOMY_COLOR_SELECT },
        category: { select: TAXONOMY_COLOR_SELECT },
        tags: { select: TAXONOMY_COLOR_SELECT, orderBy: { name: 'asc' } },
        attachments: {
          select: ATTACHMENT_SELECT,
          orderBy: { createdAt: 'asc' },
        },
        careInvoice: { select: { id: true, status: true } },
        reconciliationUpdatedBy: { select: { id: true, name: true } },
      },
    })

    if (!txn) {
      throw new Error('Transaction not found.')
    }

    let transferCounterpart: TransactionDetailDto['transferCounterpart'] = null
    if (txn.transferGroupId) {
      const other = await prisma.transaction.findFirst({
        where: {
          transferGroupId: txn.transferGroupId,
          id: { not: txn.id },
          financialAccount: ownOrGlobal(userId),
        },
        select: {
          id: true,
          financialAccountId: true,
          amount: true,
          financialAccount: { select: { name: true } },
        },
      })
      if (other) {
        transferCounterpart = {
          id: other.id,
          financialAccountId: other.financialAccountId,
          accountName: other.financialAccount.name,
          amount: other.amount.toString(),
        }
      }
    }

    return toTransactionDetailDto(txn, transferCounterpart)
  })

function toColoredTaxonomyRef(
  value: ColoredTaxonomyRef | null | undefined,
): ColoredTaxonomyRef | null {
  if (!value) return null
  return {
    id: value.id,
    name: value.name,
    bgColor: value.bgColor,
    textColor: value.textColor,
  }
}

function toTransactionDetailDto(
  txn: {
    id: string
    userId: string
    financialAccountId: string
    type: TransactionType
    amount: { toString(): string }
    description: string | null
    date: Date
    transferGroupId: string | null
    createdAt: Date
    updatedAt: Date
    reconciliationStatus: ReconciliationStatus
    reconciliationUpdatedAt: Date | null
    reconciliationUpdatedBy?: ReconciliationActorRef | null
    payee: ColoredTaxonomyRef | null
    category: ColoredTaxonomyRef | null
    tags: ColoredTaxonomyRef[]
    attachments: AttachmentRef[]
    financialAccount: {
      id: string
      name: string
      isGlobal: boolean
    }
    careInvoice: { id: string; status: string } | null
  },
  transferCounterpart: TransactionDetailDto['transferCounterpart'],
): TransactionDetailDto {
  return {
    id: txn.id,
    userId: txn.userId,
    financialAccountId: txn.financialAccountId,
    type: txn.type,
    amount: txn.amount.toString(),
    description: txn.description,
    date: txn.date.toISOString(),
    payee: toColoredTaxonomyRef(txn.payee),
    category: toColoredTaxonomyRef(txn.category),
    tags: txn.tags.map(
      (tag) => toColoredTaxonomyRef(tag) as ColoredTaxonomyRef,
    ),
    attachments: txn.attachments.map(toAttachmentListItem),
    account: {
      id: txn.financialAccount.id,
      name: txn.financialAccount.name,
      isGlobal: txn.financialAccount.isGlobal,
    },
    transferGroupId: txn.transferGroupId,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
    reconciliationStatus: txn.reconciliationStatus,
    reconciliationUpdatedAt: txn.reconciliationUpdatedAt
      ? txn.reconciliationUpdatedAt.toISOString()
      : null,
    reconciliationUpdatedBy: txn.reconciliationUpdatedBy
      ? {
          id: txn.reconciliationUpdatedBy.id,
          name: txn.reconciliationUpdatedBy.name,
        }
      : null,
    transferCounterpart,
    careInvoice: txn.careInvoice
      ? { id: txn.careInvoice.id, status: txn.careInvoice.status }
      : null,
  }
}

export const getAccountCurrentBalance = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const accountId =
      typeof (data as { accountId?: unknown }).accountId === 'string'
        ? (data as { accountId: string }).accountId
        : ''
    if (!accountId) {
      throw new Error('Account id is required.')
    }
    return { accountId }
  })
  .handler(async ({ data }): Promise<{ currentBalance: string }> => {
    const userId = await requireUserId()
    const account = await assertAccountVisible(userId, data.accountId)

    const aggregate = await prisma.transaction.aggregate({
      where: { financialAccountId: data.accountId },
      _sum: { amount: true },
    })

    const opening = Number(account.initialBalance.toString())
    const txnSum = Number(aggregate._sum.amount?.toString() ?? '0')
    const current = opening + txnSum

    return { currentBalance: current.toFixed(4) }
  })

export const createTransaction = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    const financialAccountId =
      typeof input.financialAccountId === 'string'
        ? input.financialAccountId
        : ''
    if (!financialAccountId) {
      throw new Error('Account id is required.')
    }

    const type = input.type
    if (
      typeof type !== 'string' ||
      !TRANSACTION_TYPES.includes(type as TransactionType)
    ) {
      throw new Error('Transaction type is invalid.')
    }

    const amount = typeof input.amount === 'string' ? input.amount : ''
    parsePositiveAmount(amount)

    const date = typeof input.date === 'string' ? input.date : ''
    parseDate(date)

    const description =
      typeof input.description === 'string' ? input.description.trim() : ''

    const direction = parseDirection(input.direction)
    if (
      transactionTypeNeedsDirection(type as TransactionType) &&
      !direction
    ) {
      throw new Error('Direction is required for this transaction type.')
    }

    const payee =
      typeof input.payee === 'string'
        ? input.payee
        : input.payee === null
          ? null
          : ''
    const category =
      typeof input.category === 'string'
        ? input.category
        : input.category === null
          ? null
          : ''
    const tags = Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const attachments = parseAttachments(input.attachments)

    return {
      financialAccountId,
      type: type as TransactionType,
      amount,
      date,
      description: description || null,
      direction,
      payee,
      category,
      tags,
      attachments,
    }
  })
  .handler(async ({ data }): Promise<TransactionListItem> => {
    const userId = await requireUserId()
    await assertAccountVisible(userId, data.financialAccountId)

    const signedAmount = toSignedTransactionAmount(
      data.type,
      parsePositiveAmount(data.amount),
      data.direction,
    )

    const [payeeId, categoryId, tagIds] = await Promise.all([
      resolvePayeeId(data.payee),
      resolveCategoryId(data.category),
      resolveTagIds(data.tags),
    ])

    const created = await prisma.transaction.create({
      data: {
        userId,
        financialAccountId: data.financialAccountId,
        type: data.type,
        amount: signedAmount,
        date: parseDate(data.date),
        description: data.description,
        payeeId,
        categoryId,
        ...(tagIds.length > 0
          ? { tags: { connect: tagIds.map((id) => ({ id })) } }
          : {}),
      },
      include: {
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        financialAccount: { select: { name: true, isGlobal: true, userId: true } },
      },
    })

    const attachments = await linkAttachments(userId, data.attachments, [
      created.id,
    ])

    const amountLabel = Math.abs(Number(created.amount.toString())).toFixed(2)
    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.transaction,
      entityId: created.id,
      summary: `Created ${created.type.toLowerCase().replaceAll('_', ' ')} of $${amountLabel} on ${created.financialAccount.name}`,
      changes: createChanges(
        {
          financialAccountId: created.financialAccountId,
          type: created.type,
          amount: created.amount.toString(),
          description: created.description,
          date: created.date.toISOString(),
          payeeId: created.payeeId,
          categoryId: created.categoryId,
          transferGroupId: created.transferGroupId,
        },
        TRANSACTION_ACTIVITY_FIELDS,
      ),
      linkMeta: {
        isGlobal: created.financialAccount.isGlobal,
        accountName: created.financialAccount.name,
      },
      visibilityUserId: created.financialAccount.userId,
    })

    return {
      ...toTransactionListItem(created),
      attachments,
    }
  })

export type TransferCreateResult = {
  transferGroupId: string
  from: TransactionListItem
  to: TransactionListItem
}

export const createTransfer = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>

    const fromAccountId =
      typeof input.fromAccountId === 'string' ? input.fromAccountId : ''
    const toAccountId =
      typeof input.toAccountId === 'string' ? input.toAccountId : ''
    if (!fromAccountId || !toAccountId) {
      throw new Error('From and to accounts are required.')
    }
    if (fromAccountId === toAccountId) {
      throw new Error('From and to accounts must be different.')
    }

    const amount = typeof input.amount === 'string' ? input.amount : ''
    parsePositiveAmount(amount)

    const date = typeof input.date === 'string' ? input.date : ''
    parseDate(date)

    const description =
      typeof input.description === 'string' ? input.description.trim() : ''
    const attachments = parseAttachments(input.attachments)

    return {
      fromAccountId,
      toAccountId,
      amount,
      date,
      description: description || null,
      attachments,
    }
  })
  .handler(async ({ data }): Promise<TransferCreateResult> => {
    const userId = await requireUserId()
    await assertAccountVisible(userId, data.fromAccountId)
    await assertAccountVisible(userId, data.toAccountId)

    const magnitude = parsePositiveAmount(data.amount)
    const date = parseDate(data.date)
    const outAmount = toSignedTransactionAmount('TRANSFER', magnitude, 'out')
    const inAmount = toSignedTransactionAmount('TRANSFER', magnitude, 'in')
    const transferGroupId = crypto.randomUUID()

    const [fromTxn, toTxn] = await prisma.$transaction(async (tx) => {
      const from = await tx.transaction.create({
        data: {
          userId,
          financialAccountId: data.fromAccountId,
          type: 'TRANSFER',
          amount: outAmount,
          date,
          description: data.description,
          transferGroupId,
        },
      })
      const to = await tx.transaction.create({
        data: {
          userId,
          financialAccountId: data.toAccountId,
          type: 'TRANSFER',
          amount: inAmount,
          date,
          description: data.description,
          transferGroupId,
        },
      })

      const [fromAccount, toAccount] = await Promise.all([
        tx.financialAccount.findUniqueOrThrow({
          where: { id: data.fromAccountId },
          select: { name: true, isGlobal: true, userId: true },
        }),
        tx.financialAccount.findUniqueOrThrow({
          where: { id: data.toAccountId },
          select: { name: true, isGlobal: true },
        }),
      ])

      await logActivity(
        {
          actorUserId: userId,
          action: 'CREATE',
          entityType: ACTIVITY_ENTITY_TYPES.transaction,
          entityId: from.id,
          summary: `Transferred $${magnitude.toFixed(2)} from ${fromAccount.name} to ${toAccount.name}`,
          changes: createChanges(
            {
              financialAccountId: from.financialAccountId,
              type: from.type,
              amount: from.amount.toString(),
              description: from.description,
              date: from.date.toISOString(),
              payeeId: from.payeeId,
              categoryId: from.categoryId,
              transferGroupId: from.transferGroupId,
              toTransactionId: to.id,
              toAccountId: to.financialAccountId,
            },
            [
              ...TRANSACTION_ACTIVITY_FIELDS,
              'toTransactionId',
              'toAccountId',
            ],
          ),
          linkMeta: {
            isGlobal: fromAccount.isGlobal || toAccount.isGlobal,
            accountName: fromAccount.name,
          },
          visibilityUserId: fromAccount.userId,
        },
        tx,
      )

      return [from, to] as const
    })

    const attachments = await linkAttachments(userId, data.attachments, [
      fromTxn.id,
      toTxn.id,
    ])

    const empty = emptyTaxonomies()
    return {
      transferGroupId,
      from: {
        id: fromTxn.id,
        userId: fromTxn.userId,
        financialAccountId: fromTxn.financialAccountId,
        type: fromTxn.type,
        amount: fromTxn.amount.toString(),
        description: fromTxn.description,
        date: fromTxn.date.toISOString(),
        ...empty,
        attachments,
      },
      to: {
        id: toTxn.id,
        userId: toTxn.userId,
        financialAccountId: toTxn.financialAccountId,
        type: toTxn.type,
        amount: toTxn.amount.toString(),
        description: toTxn.description,
        date: toTxn.date.toISOString(),
        ...empty,
        attachments,
      },
    }
  })

function parseKeepAttachmentIds(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error('keepAttachmentIds must be an array.')
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue
    const id = item.trim()
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

async function deleteUnreferencedAttachments(
  attachmentIds: string[],
): Promise<string[]> {
  const cleanupErrors: string[] = []
  for (const id of attachmentIds) {
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      select: {
        id: true,
        storageKey: true,
        thumbnailKey: true,
        _count: { select: { transactions: true } },
      },
    })
    if (!attachment || attachment._count.transactions > 0) continue

    await prisma.attachment.delete({ where: { id: attachment.id } })

    try {
      await deleteObject(attachment.storageKey)
      if (attachment.thumbnailKey) {
        await deleteObject(attachment.thumbnailKey)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown storage error'
      cleanupErrors.push(
        `Failed to delete stored file for attachment ${attachment.id}: ${message}`,
      )
    }
  }
  return cleanupErrors
}

const detailInclude = {
  financialAccount: {
    select: { id: true, name: true, isGlobal: true, userId: true },
  },
  payee: { select: TAXONOMY_COLOR_SELECT },
  category: { select: TAXONOMY_COLOR_SELECT },
  tags: { select: TAXONOMY_COLOR_SELECT, orderBy: { name: 'asc' as const } },
  attachments: {
    select: ATTACHMENT_SELECT,
    orderBy: { createdAt: 'asc' as const },
  },
  careInvoice: { select: { id: true, status: true } },
  reconciliationUpdatedBy: { select: { id: true, name: true } },
} as const

export const updateTransaction = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) {
      throw new Error('Transaction id is required.')
    }

    const amount = typeof input.amount === 'string' ? input.amount : ''
    parsePositiveAmount(amount)

    const description =
      typeof input.description === 'string' ? input.description.trim() : ''

    const direction = parseDirection(input.direction)

    const dateRaw = typeof input.date === 'string' ? input.date.trim() : ''
    if (dateRaw) {
      parseDate(dateRaw)
    }

    const payee =
      typeof input.payee === 'string'
        ? input.payee
        : input.payee === null
          ? null
          : ''
    const category =
      typeof input.category === 'string'
        ? input.category
        : input.category === null
          ? null
          : ''
    const tags = Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const keepAttachmentIds = parseKeepAttachmentIds(input.keepAttachmentIds)
    const attachments = parseAttachments(input.attachments)
    const duringReconciliation = input.duringReconciliation === true

    return {
      id,
      amount,
      description: description || null,
      direction,
      date: dateRaw || null,
      payee,
      category,
      tags,
      keepAttachmentIds,
      attachments,
      duringReconciliation,
    }
  })
  .handler(async ({ data }): Promise<TransactionDetailDto> => {
    const userId = await requireUserId()

    const existing = await prisma.transaction.findFirst({
      where: {
        id: data.id,
        financialAccount: ownOrGlobal(userId),
      },
      include: {
        financialAccount: {
          select: { id: true, name: true, isGlobal: true, userId: true },
        },
        tags: { select: { id: true } },
        attachments: { select: ATTACHMENT_SELECT },
        careInvoice: { select: { id: true, status: true } },
      },
    })

    if (!existing) {
      throw new Error('Transaction not found.')
    }

    assertCanMutateReconciliationStatus(existing.reconciliationStatus)

    const nextDate = data.date ? parseDate(data.date) : existing.date

    const isTransfer = existing.type === 'TRANSFER'
    const magnitude = parsePositiveAmount(data.amount)
    const direction =
      data.direction ??
      (transactionTypeNeedsDirection(existing.type)
        ? directionFromSignedAmount(existing.amount.toString())
        : undefined)

    if (transactionTypeNeedsDirection(existing.type) && !direction) {
      throw new Error('Direction is required for this transaction type.')
    }

    const signedAmount = toSignedTransactionAmount(
      existing.type,
      magnitude,
      direction,
    )

    const [payeeId, categoryId, tagIds] = isTransfer
      ? [null, null, [] as string[]]
      : await Promise.all([
          resolvePayeeId(data.payee),
          resolveCategoryId(data.category),
          resolveTagIds(data.tags),
        ])

    const attachmentPlan = planAttachmentChanges({
      existingIds: existing.attachments.map((item) => item.id),
      keepIds: data.keepAttachmentIds,
      newCount: data.attachments.length,
    })

    let counterpart: {
      id: string
      financialAccountId: string
      amount: { toString(): string }
      description: string | null
      date: Date
      type: TransactionType
      payeeId: string | null
      categoryId: string | null
      transferGroupId: string | null
      reconciliationStatus: ReconciliationStatus
      financialAccount: {
        name: string
        isGlobal: boolean
        userId: string
      }
      tags: { id: string }[]
      attachments: AttachmentRef[]
    } | null = null

    if (isTransfer && existing.transferGroupId) {
      counterpart = await prisma.transaction.findFirst({
        where: {
          transferGroupId: existing.transferGroupId,
          id: { not: existing.id },
          financialAccount: ownOrGlobal(userId),
        },
        include: {
          financialAccount: {
            select: { name: true, isGlobal: true, userId: true },
          },
          tags: { select: { id: true } },
          attachments: { select: ATTACHMENT_SELECT },
        },
      })
      if (!counterpart) {
        throw new Error('Transfer counterpart not found.')
      }
    }

    const linkedTransactionIds = counterpart
      ? [existing.id, counterpart.id]
      : [existing.id]

    const beforeSnapshot = buildTransactionActivitySnapshot({
      financialAccountId: existing.financialAccountId,
      type: existing.type,
      amount: existing.amount,
      description: existing.description,
      date: existing.date,
      payeeId: existing.payeeId,
      categoryId: existing.categoryId,
      transferGroupId: existing.transferGroupId,
      tagIds: existing.tags.map((tag) => tag.id),
      attachmentIds: existing.attachments.map((item) => item.id),
      reconciliationStatus: existing.reconciliationStatus,
    })

    const counterpartBeforeSnapshot = counterpart
      ? buildTransactionActivitySnapshot({
          financialAccountId: counterpart.financialAccountId,
          type: counterpart.type,
          amount: counterpart.amount,
          description: counterpart.description,
          date: counterpart.date,
          payeeId: counterpart.payeeId,
          categoryId: counterpart.categoryId,
          transferGroupId: counterpart.transferGroupId,
          tagIds: counterpart.tags.map((tag) => tag.id),
          attachmentIds: counterpart.attachments.map((item) => item.id),
          reconciliationStatus: counterpart.reconciliationStatus,
        })
      : null

    const counterpartSignedAmount = counterpart
      ? toSignedTransactionAmount(
          'TRANSFER',
          magnitude,
          directionFromSignedAmount(counterpart.amount.toString()),
        )
      : null

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: existing.id },
        data: {
          amount: signedAmount,
          description: data.description,
          date: nextDate,
          ...(isTransfer
            ? {}
            : {
                payeeId,
                categoryId,
                tags: { set: tagIds.map((id) => ({ id })) },
              }),
        },
      })

      if (counterpart && counterpartSignedAmount !== null) {
        assertCanMutateReconciliationStatus(counterpart.reconciliationStatus)
        await tx.transaction.update({
          where: { id: counterpart.id },
          data: {
            amount: counterpartSignedAmount,
            description: data.description,
            date: nextDate,
          },
        })
      }

      if (attachmentPlan.removeIds.length > 0) {
        for (const attachmentId of attachmentPlan.removeIds) {
          await tx.attachment.update({
            where: { id: attachmentId },
            data: {
              transactions: {
                disconnect: linkedTransactionIds.map((id) => ({ id })),
              },
            },
          })
        }
      }

      if (data.attachments.length > 0) {
        for (const meta of data.attachments) {
          assertObjectKeyOwnedByUser(meta.storageKey, userId)
          assertAllowedContentType(meta.contentType)
          assertUploadSize(meta.byteSize)
          await tx.attachment.create({
            data: {
              userId,
              storageKey: meta.storageKey,
              thumbnailKey: meta.thumbnailKey,
              fileName: meta.fileName,
              contentType: meta.contentType,
              byteSize: meta.byteSize,
              transactions: {
                connect: linkedTransactionIds.map((id) => ({ id })),
              },
            },
          })
        }
      }

      // Ensure retained attachments stay linked to both transfer legs.
      if (counterpart && attachmentPlan.retainIds.length > 0) {
        for (const attachmentId of attachmentPlan.retainIds) {
          await tx.attachment.update({
            where: { id: attachmentId },
            data: {
              transactions: {
                connect: linkedTransactionIds.map((id) => ({ id })),
              },
            },
          })
        }
      }
    })

    const updated = await prisma.transaction.findFirstOrThrow({
      where: { id: existing.id },
      include: detailInclude,
    })

    const afterSnapshot = buildTransactionActivitySnapshot({
      financialAccountId: updated.financialAccountId,
      type: updated.type,
      amount: updated.amount,
      description: updated.description,
      date: updated.date,
      payeeId: updated.payeeId,
      categoryId: updated.categoryId,
      transferGroupId: updated.transferGroupId,
      tagIds: updated.tags.map((tag) => tag.id),
      attachmentIds: updated.attachments.map((item) => item.id),
      reconciliationStatus: updated.reconciliationStatus,
    })

    const changes = diffChanges(
      beforeSnapshot,
      afterSnapshot,
      TRANSACTION_UPDATE_ACTIVITY_FIELDS,
    )

    if (Object.keys(changes).length > 0) {
      const amountLabel = Math.abs(Number(updated.amount.toString())).toFixed(2)
      const baseSummary = `Updated ${updated.type.toLowerCase().replaceAll('_', ' ')} of $${amountLabel} on ${updated.financialAccount.name}`
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.transaction,
        entityId: updated.id,
        summary: data.duringReconciliation
          ? `${baseSummary} during reconciliation`
          : baseSummary,
        changes,
        linkMeta: {
          isGlobal: updated.financialAccount.isGlobal,
          accountName: updated.financialAccount.name,
          ...(data.duringReconciliation
            ? { duringReconciliation: true }
            : {}),
        },
        visibilityUserId: updated.financialAccount.userId,
      })
    }

    if (counterpart && counterpartBeforeSnapshot) {
      const updatedCounterpart = await prisma.transaction.findFirstOrThrow({
        where: { id: counterpart.id },
        include: {
          financialAccount: {
            select: { name: true, isGlobal: true, userId: true },
          },
          tags: { select: { id: true } },
          attachments: { select: { id: true } },
        },
      })
      const counterpartAfter = buildTransactionActivitySnapshot({
        financialAccountId: updatedCounterpart.financialAccountId,
        type: updatedCounterpart.type,
        amount: updatedCounterpart.amount,
        description: updatedCounterpart.description,
        date: updatedCounterpart.date,
        payeeId: updatedCounterpart.payeeId,
        categoryId: updatedCounterpart.categoryId,
        transferGroupId: updatedCounterpart.transferGroupId,
        tagIds: updatedCounterpart.tags.map((tag) => tag.id),
        attachmentIds: updatedCounterpart.attachments.map((item) => item.id),
        reconciliationStatus: updatedCounterpart.reconciliationStatus,
      })
      const counterpartChanges = diffChanges(
        counterpartBeforeSnapshot,
        counterpartAfter,
        TRANSACTION_UPDATE_ACTIVITY_FIELDS,
      )
      if (Object.keys(counterpartChanges).length > 0) {
        const amountLabel = Math.abs(
          Number(updatedCounterpart.amount.toString()),
        ).toFixed(2)
        const baseSummary = `Updated transfer of $${amountLabel} on ${updatedCounterpart.financialAccount.name}`
        await logActivity({
          actorUserId: userId,
          action: 'UPDATE',
          entityType: ACTIVITY_ENTITY_TYPES.transaction,
          entityId: updatedCounterpart.id,
          summary: data.duringReconciliation
            ? `${baseSummary} during reconciliation`
            : baseSummary,
          changes: counterpartChanges,
          linkMeta: {
            isGlobal: updatedCounterpart.financialAccount.isGlobal,
            accountName: updatedCounterpart.financialAccount.name,
            ...(data.duringReconciliation
              ? { duringReconciliation: true }
              : {}),
          },
          visibilityUserId: updatedCounterpart.financialAccount.userId,
        })
      }
    }

    const cleanupErrors = await deleteUnreferencedAttachments(
      attachmentPlan.removeIds,
    )
    if (cleanupErrors.length > 0) {
      console.error(
        '[updateTransaction] attachment cleanup warnings:',
        cleanupErrors.join('; '),
      )
    }

    let transferCounterpart: TransactionDetailDto['transferCounterpart'] = null
    if (updated.transferGroupId) {
      const other = await prisma.transaction.findFirst({
        where: {
          transferGroupId: updated.transferGroupId,
          id: { not: updated.id },
          financialAccount: ownOrGlobal(userId),
        },
        select: {
          id: true,
          financialAccountId: true,
          amount: true,
          financialAccount: { select: { name: true } },
        },
      })
      if (other) {
        transferCounterpart = {
          id: other.id,
          financialAccountId: other.financialAccountId,
          accountName: other.financialAccount.name,
          amount: other.amount.toString(),
        }
      }
    }

    return toTransactionDetailDto(updated, transferCounterpart)
  })

export const setTransactionReconciliationStatus = createServerFn({
  method: 'POST',
})
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!id) {
      throw new Error('Transaction id is required.')
    }
    if (!isMutableReconciliationStatus(input.status)) {
      throw new Error('Invalid reconciliation status.')
    }
    return {
      id,
      status: input.status as MutableReconciliationStatus,
    }
  })
  .handler(async ({ data }): Promise<TransactionListItem> => {
    const userId = await requireUserId()

    const existing = await prisma.transaction.findFirst({
      where: {
        id: data.id,
        financialAccount: { userId },
      },
      include: {
        financialAccount: {
          select: { id: true, name: true, isGlobal: true, userId: true },
        },
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        reconciliationUpdatedBy: { select: { id: true, name: true } },
      },
    })

    if (!existing) {
      throw new Error('Transaction not found.')
    }

    assertCanMutateReconciliationStatus(existing.reconciliationStatus)

    if (existing.reconciliationStatus === data.status) {
      return toTransactionListItem(existing)
    }

    const now = new Date()
    const updated = await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        reconciliationStatus: data.status,
        reconciliationUpdatedAt: now,
        reconciliationUpdatedById: userId,
      },
      include: {
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        reconciliationUpdatedBy: { select: { id: true, name: true } },
      },
    })

    await logActivity({
      actorUserId: userId,
      action: 'UPDATE',
      entityType: ACTIVITY_ENTITY_TYPES.transaction,
      entityId: updated.id,
      summary: reconciliationStatusActivitySummary(data.status),
      changes: {
        reconciliationStatus: {
          before: existing.reconciliationStatus,
          after: data.status,
        },
      },
      linkMeta: {
        isGlobal: existing.financialAccount.isGlobal,
        accountName: existing.financialAccount.name,
        duringReconciliation: true,
      },
      visibilityUserId: existing.financialAccount.userId,
    })

    return toTransactionListItem(updated)
  })

export const finishAccountReconciliation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const accountId =
      typeof (data as { accountId?: unknown }).accountId === 'string'
        ? (data as { accountId: string }).accountId.trim()
        : ''
    if (!accountId) {
      throw new Error('Account id is required.')
    }
    return { accountId }
  })
  .handler(
    async ({
      data,
    }): Promise<{ reconciledCount: number; transactionIds: string[] }> => {
      const userId = await requireUserId()
      const account = await assertAccountOwned(userId, data.accountId)

      const cleared = await prisma.transaction.findMany({
        where: {
          financialAccountId: account.id,
          reconciliationStatus: ReconciliationStatusEnum.CLEARED,
        },
        select: {
          id: true,
          reconciliationStatus: true,
        },
      })

      if (cleared.length === 0) {
        return { reconciledCount: 0, transactionIds: [] }
      }

      const now = new Date()
      const ids = cleared.map((txn) => txn.id)

      await prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: {
          reconciliationStatus: ReconciliationStatusEnum.RECONCILED,
          reconciliationUpdatedAt: now,
          reconciliationUpdatedById: userId,
        },
      })

      for (const txn of cleared) {
        await logActivity({
          actorUserId: userId,
          action: 'UPDATE',
          entityType: ACTIVITY_ENTITY_TYPES.transaction,
          entityId: txn.id,
          summary: reconciliationStatusActivitySummary('RECONCILED'),
          changes: {
            reconciliationStatus: {
              before: txn.reconciliationStatus,
              after: ReconciliationStatusEnum.RECONCILED,
            },
          },
          linkMeta: {
            isGlobal: account.isGlobal,
            accountName: account.name,
            duringReconciliation: true,
          },
          visibilityUserId: account.userId,
        })
      }

      return { reconciledCount: ids.length, transactionIds: ids }
    },
  )
