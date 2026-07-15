import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { TransactionType as TransactionTypeEnum } from '#/generated/prisma/enums'
import type { TransactionType } from '#/generated/prisma/enums'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
} from '#/lib/activity'
import {
  assertAllowedContentType,
  assertUploadSize,
  MAX_ATTACHMENTS_PER_TXN,
  type AttachmentListItem,
  type AttachmentUploadMeta,
} from '#/lib/attachment-types'
import { prisma } from '#/lib/prisma'
import { assertObjectKeyOwnedByUser } from '#/lib/storage'
import {
  toSignedTransactionAmount,
  transactionTypeNeedsDirection,
  type TransactionDirection,
} from '#/lib/transaction-amount'
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

export type TransactionDetailDto = VisibleTransactionListItem & {
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

type AttachmentRef = AttachmentListItem

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
}

type TransactionWithAccount = TransactionWithTaxonomies & {
  financialAccount: {
    id: string
    name: string
    isGlobal: boolean
  }
}

function toAttachmentListItem(attachment: AttachmentRef): AttachmentListItem {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    byteSize: attachment.byteSize,
    storageKey: attachment.storageKey,
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

    if (seenKeys.has(storageKey)) {
      throw new Error('Duplicate attachment keys are not allowed.')
    }
    seenKeys.add(storageKey)

    attachments.push({
      storageKey,
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
    select: { id: true, name: true, initialBalance: true },
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
      },
    })

    return transactions.map(toVisibleTransactionListItem)
  },
)

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
          select: { id: true, name: true, isGlobal: true },
        },
        payee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        attachments: {
          select: {
            id: true,
            fileName: true,
            contentType: true,
            byteSize: true,
            storageKey: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        careInvoice: { select: { id: true, status: true } },
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

    return {
      ...toVisibleTransactionListItem(txn),
      transferGroupId: txn.transferGroupId,
      createdAt: txn.createdAt.toISOString(),
      updatedAt: txn.updatedAt.toISOString(),
      transferCounterpart,
      careInvoice: txn.careInvoice
        ? { id: txn.careInvoice.id, status: txn.careInvoice.status }
        : null,
    }
  })

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
