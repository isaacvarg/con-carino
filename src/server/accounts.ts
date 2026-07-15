import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import { AccountType as AccountTypeEnum } from '#/generated/prisma/enums'
import type { AccountType } from '#/generated/prisma/enums'
import {
  ACTIVITY_ENTITY_TYPES,
  createChanges,
  diffChanges,
} from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import { logActivity } from '#/server/activity-log'
import { authConfig } from '#/utils/auth'

const ACCOUNT_ACTIVITY_FIELDS = [
  'name',
  'type',
  'initialBalance',
  'isGlobal',
  'accountGroupId',
] as const

const ACCOUNT_TYPES = Object.values(AccountTypeEnum)

export type AccountListItem = {
  id: string
  userId: string
  name: string
  type: AccountType
  initialBalance: string
  currentBalance: string
  isGlobal: boolean
  accountGroupId: string | null
  accountGroup: { id: string; name: string; isGlobal: boolean } | null
  isOwned: boolean
}

export type AccountGroupListItem = {
  id: string
  userId: string
  name: string
  isGlobal: boolean
  isOwned: boolean
}

export type CreateAccountInput = {
  name: string
  type: AccountType
  initialBalance: string
  isGlobal: boolean
  groupMode: 'none' | 'existing' | 'new'
  accountGroupId: string
  newGroup: {
    name: string
    isGlobal: boolean
  }
}

async function requireUserId() {
  const request = getRequest()
  const session = await getSession(request, authConfig)
  const userId = session?.user?.id
  if (!userId) {
    throw new Error('You must be signed in to manage accounts.')
  }
  return userId
}

function ownOrGlobal(userId: string) {
  return {
    OR: [{ userId }, { isGlobal: true }],
  }
}

function parseInitialBalance(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Opening balance is required.')
  }
  const amount = Number(trimmed)
  if (!Number.isFinite(amount)) {
    throw new Error('Opening balance must be a valid number.')
  }
  return amount
}

function validateCreateInput(data: unknown): CreateAccountInput {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid account payload.')
  }

  const input = data as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) {
    throw new Error('Account name is required.')
  }

  const type = input.type
  if (
    typeof type !== 'string' ||
    !ACCOUNT_TYPES.includes(type as AccountType)
  ) {
    throw new Error('Account type is invalid.')
  }

  const initialBalance =
    typeof input.initialBalance === 'string' ? input.initialBalance : ''
  parseInitialBalance(initialBalance)

  const isGlobal = Boolean(input.isGlobal)
  const groupMode = input.groupMode
  if (
    groupMode !== 'none' &&
    groupMode !== 'existing' &&
    groupMode !== 'new'
  ) {
    throw new Error('Group mode is invalid.')
  }

  const accountGroupId =
    typeof input.accountGroupId === 'string' ? input.accountGroupId : ''
  const newGroupRaw =
    input.newGroup && typeof input.newGroup === 'object'
      ? (input.newGroup as Record<string, unknown>)
      : {}
  const newGroup = {
    name: typeof newGroupRaw.name === 'string' ? newGroupRaw.name.trim() : '',
    isGlobal: Boolean(newGroupRaw.isGlobal),
  }

  if (groupMode === 'existing' && !accountGroupId) {
    throw new Error('Select an account group.')
  }
  if (groupMode === 'new' && !newGroup.name) {
    throw new Error('New group name is required.')
  }

  return {
    name,
    type: type as AccountType,
    initialBalance,
    isGlobal,
    groupMode,
    accountGroupId,
    newGroup,
  }
}

function formatBalance(value: number): string {
  return value.toFixed(4)
}

async function currentBalancesForAccounts(
  accounts: Array<{ id: string; initialBalance: { toString(): string } }>,
): Promise<Map<string, string>> {
  if (accounts.length === 0) {
    return new Map()
  }

  const sums = await prisma.transaction.groupBy({
    by: ['financialAccountId'],
    where: {
      financialAccountId: { in: accounts.map((account) => account.id) },
    },
    _sum: { amount: true },
  })

  const txnSumByAccountId = new Map(
    sums.map((row) => [
      row.financialAccountId,
      Number(row._sum.amount?.toString() ?? '0'),
    ]),
  )

  return new Map(
    accounts.map((account) => {
      const opening = Number(account.initialBalance.toString())
      const txnSum = txnSumByAccountId.get(account.id) ?? 0
      return [account.id, formatBalance(opening + txnSum)]
    }),
  )
}

export const listAccounts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountListItem[]> => {
    const userId = await requireUserId()
    const accounts = await prisma.financialAccount.findMany({
      where: ownOrGlobal(userId),
      include: {
        accountGroup: {
          select: { id: true, name: true, isGlobal: true },
        },
      },
      orderBy: [{ name: 'asc' }],
    })

    const balances = await currentBalancesForAccounts(accounts)

    return accounts.map((account) => ({
      id: account.id,
      userId: account.userId,
      name: account.name,
      type: account.type,
      initialBalance: account.initialBalance.toString(),
      currentBalance:
        balances.get(account.id) ??
        formatBalance(Number(account.initialBalance.toString())),
      isGlobal: account.isGlobal,
      accountGroupId: account.accountGroupId,
      accountGroup: account.accountGroup,
      isOwned: account.userId === userId,
    }))
  },
)

export const listAccountGroups = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountGroupListItem[]> => {
    const userId = await requireUserId()
    const groups = await prisma.accountGroup.findMany({
      where: ownOrGlobal(userId),
      orderBy: [{ name: 'asc' }],
    })

    return groups.map((group) => ({
      id: group.id,
      userId: group.userId,
      name: group.name,
      isGlobal: group.isGlobal,
      isOwned: group.userId === userId,
    }))
  },
)

function toAccountListItem(
  account: {
    id: string
    userId: string
    name: string
    type: AccountType
    initialBalance: { toString(): string }
    isGlobal: boolean
    accountGroupId: string | null
    accountGroup: { id: string; name: string; isGlobal: boolean } | null
  },
  currentUserId: string,
  currentBalance: string,
): AccountListItem {
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    type: account.type,
    initialBalance: account.initialBalance.toString(),
    currentBalance,
    isGlobal: account.isGlobal,
    accountGroupId: account.accountGroupId,
    accountGroup: account.accountGroup,
    isOwned: account.userId === currentUserId,
  }
}

async function toAccountListItemWithBalance(
  account: {
    id: string
    userId: string
    name: string
    type: AccountType
    initialBalance: { toString(): string }
    isGlobal: boolean
    accountGroupId: string | null
    accountGroup: { id: string; name: string; isGlobal: boolean } | null
  },
  currentUserId: string,
): Promise<AccountListItem> {
  const balances = await currentBalancesForAccounts([account])
  return toAccountListItem(
    account,
    currentUserId,
    balances.get(account.id) ??
      formatBalance(Number(account.initialBalance.toString())),
  )
}

async function findVisibleAccount(userId: string, accountId: string) {
  return prisma.financialAccount.findFirst({
    where: {
      AND: [{ id: accountId }, ownOrGlobal(userId)],
    },
    include: {
      accountGroup: {
        select: { id: true, name: true, isGlobal: true },
      },
    },
  })
}

export const getAccount = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const id =
      typeof (data as { id?: unknown }).id === 'string'
        ? (data as { id: string }).id
        : ''
    if (!id) {
      throw new Error('Account id is required.')
    }
    return { id }
  })
  .handler(async ({ data }): Promise<AccountListItem> => {
    const userId = await requireUserId()
    const account = await findVisibleAccount(userId, data.id)
    if (!account) {
      throw new Error('Account not found.')
    }
    return toAccountListItemWithBalance(account, userId)
  })

export const checkAccountNameAvailable = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as { name?: unknown; excludeId?: unknown }
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const excludeId =
      typeof input.excludeId === 'string' && input.excludeId
        ? input.excludeId
        : undefined
    return { name, excludeId }
  })
  .handler(async ({ data }): Promise<{ available: boolean }> => {
    const userId = await requireUserId()
    if (!data.name) {
      return { available: true }
    }

    const existing = await prisma.financialAccount.findFirst({
      where: {
        AND: [
          ownOrGlobal(userId),
          { name: { equals: data.name, mode: 'insensitive' } },
          ...(data.excludeId ? [{ id: { not: data.excludeId } }] : []),
        ],
      },
      select: { id: true },
    })

    return { available: !existing }
  })

export const updateAccount = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload.')
    }
    const input = data as Record<string, unknown>
    const id = typeof input.id === 'string' ? input.id : ''
    if (!id) {
      throw new Error('Account id is required.')
    }
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) {
      throw new Error('Account name is required.')
    }
    if (typeof input.isGlobal !== 'boolean') {
      throw new Error('isGlobal must be a boolean.')
    }
    return { id, name, isGlobal: input.isGlobal }
  })
  .handler(async ({ data }): Promise<AccountListItem> => {
    const userId = await requireUserId()
    const existing = await prisma.financialAccount.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        userId: true,
        name: true,
        type: true,
        initialBalance: true,
        isGlobal: true,
        accountGroupId: true,
      },
    })

    if (!existing) {
      throw new Error('Account not found.')
    }
    if (existing.userId !== userId) {
      throw new Error('Only the account owner can update account settings.')
    }

    const duplicate = await prisma.financialAccount.findFirst({
      where: {
        AND: [
          ownOrGlobal(userId),
          { name: { equals: data.name, mode: 'insensitive' } },
          { id: { not: data.id } },
        ],
      },
      select: { id: true },
    })
    if (duplicate) {
      throw new Error('An account with this name already exists.')
    }

    const updated = await prisma.financialAccount.update({
      where: { id: data.id },
      data: {
        name: data.name,
        isGlobal: data.isGlobal,
      },
      include: {
        accountGroup: {
          select: { id: true, name: true, isGlobal: true },
        },
      },
    })

    const changes = diffChanges(
      {
        name: existing.name,
        type: existing.type,
        initialBalance: existing.initialBalance.toString(),
        isGlobal: existing.isGlobal,
        accountGroupId: existing.accountGroupId,
      },
      {
        name: updated.name,
        type: updated.type,
        initialBalance: updated.initialBalance.toString(),
        isGlobal: updated.isGlobal,
        accountGroupId: updated.accountGroupId,
      },
      ACCOUNT_ACTIVITY_FIELDS,
    )
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.account,
        entityId: updated.id,
        summary: `Updated account “${updated.name}”`,
        changes,
        linkMeta: { isGlobal: updated.isGlobal, accountName: updated.name },
        visibilityUserId: updated.userId,
      })
    }

    return toAccountListItemWithBalance(updated, userId)
  })

export const createAccount = createServerFn({ method: 'POST' })
  .validator(validateCreateInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const initialBalance = parseInitialBalance(data.initialBalance)

    const duplicate = await prisma.financialAccount.findFirst({
      where: {
        AND: [
          ownOrGlobal(userId),
          { name: { equals: data.name, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    if (duplicate) {
      throw new Error('An account with this name already exists.')
    }

    const account = await prisma.$transaction(async (tx) => {
      let accountGroupId: string | null = null

      if (data.groupMode === 'new') {
        const group = await tx.accountGroup.create({
          data: {
            userId,
            name: data.newGroup.name,
            isGlobal: data.newGroup.isGlobal,
          },
        })
        accountGroupId = group.id
      } else if (data.groupMode === 'existing') {
        const group = await tx.accountGroup.findFirst({
          where: {
            id: data.accountGroupId,
            ...ownOrGlobal(userId),
          },
          select: { id: true },
        })
        if (!group) {
          throw new Error('Selected account group was not found.')
        }
        accountGroupId = group.id
      }

      const created = await tx.financialAccount.create({
        data: {
          userId,
          name: data.name,
          type: data.type,
          initialBalance,
          isGlobal: data.isGlobal,
          accountGroupId,
        },
        include: {
          accountGroup: {
            select: { id: true, name: true, isGlobal: true },
          },
        },
      })

      await logActivity(
        {
          actorUserId: userId,
          action: 'CREATE',
          entityType: ACTIVITY_ENTITY_TYPES.account,
          entityId: created.id,
          summary: `Created account “${created.name}”`,
          changes: createChanges(
            {
              name: created.name,
              type: created.type,
              initialBalance: created.initialBalance.toString(),
              isGlobal: created.isGlobal,
              accountGroupId: created.accountGroupId,
            },
            ACCOUNT_ACTIVITY_FIELDS,
          ),
          linkMeta: { isGlobal: created.isGlobal, accountName: created.name },
          visibilityUserId: created.userId,
        },
        tx,
      )

      return created
    })

    const initialBalanceText = account.initialBalance.toString()
    return {
      id: account.id,
      userId: account.userId,
      name: account.name,
      type: account.type,
      initialBalance: initialBalanceText,
      currentBalance: formatBalance(Number(initialBalanceText)),
      isGlobal: account.isGlobal,
      accountGroupId: account.accountGroupId,
      accountGroup: account.accountGroup,
      isOwned: true,
    } satisfies AccountListItem
  })
