/**
 * Transaction type registry — the client-side view of the `transaction_types`
 * table, plus the sign arithmetic that used to live in `transaction-amount.ts`.
 *
 * The exhaustive `never` check moved from "every transaction type" to "every
 * sign". That is the invariant worth guarding at compile time: types are now
 * data and can appear at runtime, but the three ways an amount can be signed
 * are fixed, and forgetting one would silently mis-sign money.
 */

import type { TransactionSign } from '#/generated/prisma/enums'

export type TransactionDirection = 'in' | 'out'

export type TransactionTypeDto = {
  id: string
  key: string
  label: string
  sign: TransactionSign
  isSystem: boolean
  sortOrder: number
  archivedAt: string | null
}

export type TransactionTypeRegistry = readonly TransactionTypeDto[]

/**
 * The shape embedded in transaction and automation DTOs: enough to label a row
 * and to sign an amount, without shipping the admin-only fields.
 */
export type TransactionTypeRef = {
  id: string
  key: string
  label: string
  sign: TransactionSign
}

/** Prisma `select` matching `TransactionTypeRef`. */
export const TRANSACTION_TYPE_REF_SELECT = {
  id: true,
  key: true,
  label: true,
  sign: true,
} as const

/**
 * Built-in keys referenced directly by application code, so they must keep
 * existing: invoices settle as EXPENSE, and transfer legs are TRANSFER.
 * Neither may be archived or deleted.
 */
export const PROTECTED_TRANSACTION_TYPE_KEYS = ['EXPENSE', 'TRANSFER'] as const

/** Signs an admin may choose for a type they create. */
export const SELECTABLE_TRANSACTION_SIGNS: readonly TransactionSign[] = [
  'NEGATIVE',
  'POSITIVE',
]

export const TRANSACTION_SIGN_LABELS: Record<TransactionSign, string> = {
  NEGATIVE: 'Money out (negative)',
  POSITIVE: 'Money in (positive)',
  DIRECTIONAL: 'Ask each time (in or out)',
}

export function typeNeedsDirection(type: {
  sign: TransactionSign
}): boolean {
  return type.sign === 'DIRECTIONAL'
}

/**
 * Convert a positive form magnitude into a signed account delta for
 * persistence and balance math.
 */
export function signedAmountFor(
  type: { sign: TransactionSign },
  amount: number,
  direction?: TransactionDirection,
): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a valid number.')
  }

  const magnitude = Math.abs(amount)

  switch (type.sign) {
    case 'NEGATIVE':
      return -magnitude
    case 'POSITIVE':
      return magnitude
    case 'DIRECTIONAL': {
      if (direction !== 'in' && direction !== 'out') {
        throw new Error('Direction is required for this transaction type.')
      }
      return direction === 'in' ? magnitude : -magnitude
    }
    default: {
      const _exhaustive: never = type.sign
      return _exhaustive
    }
  }
}

export function defaultDirectionForType(type: {
  key: string
}): TransactionDirection {
  return type.key === 'BALANCE_ADJUSTMENT' ? 'in' : 'out'
}

export function findTransactionType(
  registry: TransactionTypeRegistry,
  id: string | null | undefined,
): TransactionTypeDto | null {
  if (!id) return null
  return registry.find((type) => type.id === id) ?? null
}

export function findTransactionTypeByKey(
  registry: TransactionTypeRegistry,
  key: string,
): TransactionTypeDto | null {
  return registry.find((type) => type.key === key) ?? null
}

export function transactionTypeLabel(
  registry: TransactionTypeRegistry,
  id: string | null | undefined,
): string {
  return findTransactionType(registry, id)?.label ?? 'Unknown type'
}

/** Live types, in admin-defined order. Archived ones never reach a picker. */
export function activeTransactionTypes(
  registry: TransactionTypeRegistry,
): TransactionTypeDto[] {
  return registry
    .filter((type) => !type.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

/**
 * Types offered on the generic add-transaction form.
 *
 * TRANSFER is excluded because a transfer is two paired rows written by
 * `createTransfer`, not something the single-row form can produce.
 */
export function transactionTypeOptions(
  registry: TransactionTypeRegistry,
): TransactionTypeDto[] {
  return activeTransactionTypes(registry).filter(
    (type) => type.key !== 'TRANSFER',
  )
}

/**
 * Types an automation may trigger on.
 *
 * DIRECTIONAL types are excluded so the runner never has to invent a direction
 * when it signs the transaction it creates. Derived rather than hand-listed:
 * the old constant was a literal array that would have silently gone stale the
 * first time an admin added a type.
 */
export function automationTriggerTypes(
  registry: TransactionTypeRegistry,
): TransactionTypeDto[] {
  return activeTransactionTypes(registry).filter(
    (type) => type.sign !== 'DIRECTIONAL',
  )
}
