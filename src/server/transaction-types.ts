import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from 'start-authjs'
import type { TransactionSign } from '#/generated/prisma/enums'
import { ACTIVITY_ENTITY_TYPES, diffChanges } from '#/lib/activity'
import { prisma } from '#/lib/prisma'
import {
  PROTECTED_TRANSACTION_TYPE_KEYS,
  SELECTABLE_TRANSACTION_SIGNS,
  type TransactionTypeDto,
} from '#/lib/transaction-types'
import { requireId, requireName } from '#/lib/validators'
import { logActivity } from '#/server/activity-log'
import { archiveOrDelete, restoreArchived } from '#/server/archive'
import { requireAdminId } from '#/server/auth-guards'
import { authConfig } from '#/utils/auth'

const TYPE_SELECT = {
  id: true,
  key: true,
  label: true,
  sign: true,
  isSystem: true,
  sortOrder: true,
  archivedAt: true,
} as const

type TypeRow = {
  id: string
  key: string
  label: string
  sign: TransactionSign
  isSystem: boolean
  sortOrder: number
  archivedAt: Date | null
}

function toDto(row: TypeRow): TransactionTypeDto {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    sign: row.sign,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  }
}

/**
 * Derive a stable code identifier from the label. Keys are immutable once
 * created, which is why this runs at create time only — renaming a type must
 * never move the identifier that transactions and app code point at.
 */
function keyFromLabel(label: string): string {
  const key = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!key) {
    throw new Error('Name must contain at least one letter or number.')
  }
  return key
}

function parseSelectableSign(value: unknown): TransactionSign {
  if (
    typeof value !== 'string' ||
    !SELECTABLE_TRANSACTION_SIGNS.includes(value as TransactionSign)
  ) {
    throw new Error('Pick whether this type adds to or subtracts from a balance.')
  }
  return value as TransactionSign
}

/** Rows that would be re-signed or broken if this type changed or vanished. */
async function countTypeRefs(typeId: string): Promise<number> {
  const [transactions, automations] = await Promise.all([
    prisma.transaction.count({ where: { typeId } }),
    prisma.automation.count({ where: { triggerTypeId: typeId } }),
  ])
  return transactions + automations
}

/**
 * Read for the client.
 *
 * Returns an empty registry rather than throwing when signed out, for the same
 * reason `getModuleFlags` returns defaults: this runs in the `_app` layout's
 * `beforeLoad`, which fires alongside the redirect to /login, and a throw there
 * replaces the login redirect with an error screen and locks everyone out.
 */
export const listTransactionTypes = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TransactionTypeDto[]> => {
    const session = await getSession(getRequest(), authConfig)
    if (!session?.user?.id) return []
    const rows = await prisma.transactionTypeDef.findMany({
      select: TYPE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map(toDto)
  },
)

/**
 * Reference counts per type id, for the settings list.
 *
 * Drives both the "used by N records" line and whether the sign control is
 * editable, so the UI shows the same rule the server enforces instead of
 * offering a control that will be rejected on save.
 */
export const listTransactionTypeUsage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Record<string, number>> => {
    await requireAdminId()
    const [transactions, automations] = await Promise.all([
      prisma.transaction.groupBy({ by: ['typeId'], _count: { _all: true } }),
      prisma.automation.groupBy({
        by: ['triggerTypeId'],
        _count: { _all: true },
      }),
    ])

    const usage: Record<string, number> = {}
    for (const row of transactions) {
      usage[row.typeId] = (usage[row.typeId] ?? 0) + row._count._all
    }
    for (const row of automations) {
      if (!row.triggerTypeId) continue
      usage[row.triggerTypeId] =
        (usage[row.triggerTypeId] ?? 0) + row._count._all
    }
    return usage
  },
)

export const createTransactionType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return {
      label: requireName(input.label),
      sign: parseSelectableSign(input.sign),
    }
  })
  .handler(async ({ data }): Promise<TransactionTypeDto> => {
    const userId = await requireAdminId()
    const key = keyFromLabel(data.label)

    const clash = await prisma.transactionTypeDef.findUnique({
      where: { key },
      select: { id: true, label: true },
    })
    if (clash) {
      throw new Error(`A transaction type named “${clash.label}” already exists.`)
    }

    const last = await prisma.transactionTypeDef.aggregate({
      _max: { sortOrder: true },
    })

    const created = await prisma.transactionTypeDef.create({
      data: {
        key,
        label: data.label,
        sign: data.sign,
        isSystem: false,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: TYPE_SELECT,
    })

    await logActivity({
      actorUserId: userId,
      action: 'CREATE',
      entityType: ACTIVITY_ENTITY_TYPES.transaction_type,
      entityId: created.id,
      summary: `Created transaction type “${created.label}”`,
      changes: {
        label: { before: null, after: created.label },
        sign: { before: null, after: created.sign },
      },
    })

    return toDto(created)
  })

export const updateTransactionType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    const input = data as Record<string, unknown>
    return {
      id: requireId(input.id),
      label: requireName(input.label),
      // Absent means "leave it"; present is only honoured while unreferenced.
      sign: input.sign === undefined ? null : parseSelectableSign(input.sign),
    }
  })
  .handler(async ({ data }): Promise<TransactionTypeDto> => {
    const userId = await requireAdminId()

    const existing = await prisma.transactionTypeDef.findUnique({
      where: { id: data.id },
      select: TYPE_SELECT,
    })
    if (!existing) throw new Error('Transaction type not found.')

    let nextSign = existing.sign
    if (data.sign !== null && data.sign !== existing.sign) {
      // The real guard is "is anything relying on this sign", not "is it a
      // built-in" — amounts are stored already-signed, so flipping the sign
      // under existing rows would invert their meaning silently.
      if (existing.isSystem) {
        throw new Error(
          'Built-in transaction types keep their sign. Only the name can change.',
        )
      }
      const refs = await countTypeRefs(existing.id)
      if (refs > 0) {
        throw new Error(
          `“${existing.label}” is already used by ${refs} ${
            refs === 1 ? 'record' : 'records'
          }, so its sign is locked. Create a new type instead.`,
        )
      }
      nextSign = data.sign
    }

    const updated = await prisma.transactionTypeDef.update({
      where: { id: data.id },
      data: { label: data.label, sign: nextSign },
      select: TYPE_SELECT,
    })

    const changes = diffChanges(existing, updated, ['label', 'sign'])
    if (Object.keys(changes).length > 0) {
      await logActivity({
        actorUserId: userId,
        action: 'UPDATE',
        entityType: ACTIVITY_ENTITY_TYPES.transaction_type,
        entityId: updated.id,
        summary: `Updated transaction type “${updated.label}”`,
        changes,
      })
    }

    return toDto(updated)
  })

export const archiveTransactionType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    return { id: requireId((data as Record<string, unknown>).id) }
  })
  .handler(async ({ data }) => {
    const userId = await requireAdminId()

    const existing = await prisma.transactionTypeDef.findUnique({
      where: { id: data.id },
      select: TYPE_SELECT,
    })
    if (!existing) throw new Error('Transaction type not found.')
    if (
      PROTECTED_TRANSACTION_TYPE_KEYS.includes(
        existing.key as (typeof PROTECTED_TRANSACTION_TYPE_KEYS)[number],
      )
    ) {
      throw new Error(
        `“${existing.label}” is used directly by the app (invoices and transfers) and cannot be removed.`,
      )
    }

    return archiveOrDelete({
      entityType: ACTIVITY_ENTITY_TYPES.transaction_type,
      id: existing.id,
      label: existing.label,
      actorUserId: userId,
      // Built-ins are never hard-deleted even at zero references: the key is
      // part of the app's vocabulary and re-adding it later must not collide.
      allowArchive: true,
      countRefs: async () =>
        existing.isSystem ? 1 : await countTypeRefs(existing.id),
      hardDelete: async () => {
        await prisma.transactionTypeDef.delete({ where: { id: existing.id } })
      },
      archive: async () => {
        await prisma.transactionTypeDef.update({
          where: { id: existing.id },
          data: { archivedAt: new Date() },
        })
      },
    })
  })

export const restoreTransactionType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    return { id: requireId((data as Record<string, unknown>).id) }
  })
  .handler(async ({ data }): Promise<TransactionTypeDto> => {
    const userId = await requireAdminId()
    const existing = await prisma.transactionTypeDef.findUnique({
      where: { id: data.id },
      select: TYPE_SELECT,
    })
    if (!existing) throw new Error('Transaction type not found.')

    await restoreArchived({
      entityType: ACTIVITY_ENTITY_TYPES.transaction_type,
      id: existing.id,
      label: existing.label,
      actorUserId: userId,
      archivedAt: existing.archivedAt,
      restore: async () => {
        await prisma.transactionTypeDef.update({
          where: { id: existing.id },
          data: { archivedAt: null },
        })
      },
    })

    return toDto({ ...existing, archivedAt: null })
  })

export const deleteTransactionType = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid payload.')
    return { id: requireId((data as Record<string, unknown>).id) }
  })
  .handler(async ({ data }) => {
    const userId = await requireAdminId()
    const existing = await prisma.transactionTypeDef.findUnique({
      where: { id: data.id },
      select: TYPE_SELECT,
    })
    if (!existing) throw new Error('Transaction type not found.')
    if (existing.isSystem) {
      throw new Error('Built-in transaction types cannot be deleted.')
    }

    const refs = await countTypeRefs(existing.id)
    if (refs > 0) {
      throw new Error(
        `“${existing.label}” is used by ${refs} ${
          refs === 1 ? 'record' : 'records'
        } and cannot be permanently deleted.`,
      )
    }

    await prisma.transactionTypeDef.delete({ where: { id: existing.id } })
    await logActivity({
      actorUserId: userId,
      action: 'DELETE',
      entityType: ACTIVITY_ENTITY_TYPES.transaction_type,
      entityId: existing.id,
      summary: `Deleted transaction type “${existing.label}”`,
    })
  })
