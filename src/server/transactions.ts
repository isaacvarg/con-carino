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

export type TransactionListItem = {
  id: string
  userId: string
  financialAccountId: string
  type: TransactionType
  amount: string
  description: string | null
  date: string
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
    })

    return transactions.map((txn) => ({
      id: txn.id,
      userId: txn.userId,
      financialAccountId: txn.financialAccountId,
      type: txn.type,
      amount: txn.amount.toString(),
      description: txn.description,
      date: txn.date.toISOString(),
    }))
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

    return {
      financialAccountId,
      type: type as TransactionType,
      amount,
      date,
      description: description || null,
      direction,
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

    const created = await prisma.transaction.create({
      data: {
        userId,
        financialAccountId: data.financialAccountId,
        type: data.type,
        amount: signedAmount,
        date: parseDate(data.date),
        description: data.description,
      },
    })

    return {
      id: created.id,
      userId: created.userId,
      financialAccountId: created.financialAccountId,
      type: created.type,
      amount: created.amount.toString(),
      description: created.description,
      date: created.date.toISOString(),
    }
  })
