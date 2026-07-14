import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { TransactionType as TransactionTypeEnum } from '#/generated/prisma/enums'
import type { TransactionType } from '#/generated/prisma/enums'
import { prisma } from '#/lib/prisma'
import {
  toSignedTransactionAmount,
  transactionTypeNeedsDirection,
  type TransactionDirection,
} from '#/lib/transaction-amount'
import { authConfig } from '#/utils/auth'

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
}

type TransactionWithAccount = TransactionWithTaxonomies & {
  financialAccount: {
    id: string
    name: string
    isGlobal: boolean
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
  }
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
  if (!trimmed) {
    throw new Error('Date is required.')
  }
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Date is invalid.')
  }
  return date
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
      },
    })

    return toTransactionListItem(created)
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

    return {
      fromAccountId,
      toAccountId,
      amount,
      date,
      description: description || null,
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

    const [fromTxn, toTxn] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          financialAccountId: data.fromAccountId,
          type: 'TRANSFER',
          amount: outAmount,
          date,
          description: data.description,
          transferGroupId,
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          financialAccountId: data.toAccountId,
          type: 'TRANSFER',
          amount: inAmount,
          date,
          description: data.description,
          transferGroupId,
        },
      }),
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
      },
    }
  })
