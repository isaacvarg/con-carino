/**
 * Server-side lookups for transaction types.
 *
 * Deliberately separate from `src/server/transaction-types.ts`: that module is
 * reachable from the client graph (the `_app` registry cache imports its
 * `listTransactionTypes` server fn), and a plain `prisma`-using export there
 * would pull the client into the database graph and break hydration app-wide.
 * Same reasoning as the `createServerOnlyFn` note on `runCompleteDueShifts`.
 */

import { createServerOnlyFn } from '@tanstack/react-start'
import { prisma } from '#/lib/prisma'
import {
  TRANSACTION_TYPE_REF_SELECT,
  type TransactionTypeRef,
} from '#/lib/transaction-types'

/**
 * Load a type for a write.
 *
 * Archived types stay valid on the rows that already carry them — that is the
 * point of archiving rather than deleting — but must never be chosen for a new
 * or edited transaction.
 */
export const requireUsableTransactionType = createServerOnlyFn(async (
  typeId: string,
): Promise<TransactionTypeRef> => {
  const type = await prisma.transactionTypeDef.findUnique({
    where: { id: typeId },
    select: { ...TRANSACTION_TYPE_REF_SELECT, archivedAt: true },
  })
  if (!type) {
    throw new Error('Transaction type not found.')
  }
  if (type.archivedAt) {
    throw new Error(`“${type.label}” is archived and cannot be used.`)
  }
  return {
    id: type.id,
    key: type.key,
    label: type.label,
    sign: type.sign,
  }
})

/**
 * Load a built-in type the app references by name. These keys are protected
 * from archive and delete, so a miss means the seed data is broken rather than
 * that someone made a choice.
 */
export const requireTransactionTypeByKey = createServerOnlyFn(async (
  key: string,
): Promise<TransactionTypeRef> => {
  const type = await prisma.transactionTypeDef.findUnique({
    where: { key },
    select: TRANSACTION_TYPE_REF_SELECT,
  })
  if (!type) {
    throw new Error(`The built-in “${key}” transaction type is missing.`)
  }
  return type
})
