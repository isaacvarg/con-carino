import type { TransactionType } from '#/generated/prisma/enums'

export type TransactionDirection = 'in' | 'out'

const DIRECTIONAL_TYPES = new Set<TransactionType>([
  'TRANSFER',
  'BALANCE_ADJUSTMENT',
])

export function transactionTypeNeedsDirection(type: TransactionType): boolean {
  return DIRECTIONAL_TYPES.has(type)
}

/**
 * Convert a positive form magnitude + type (+ optional direction) into a
 * signed account delta for persistence / balance math.
 */
export function toSignedTransactionAmount(
  type: TransactionType,
  amount: number,
  direction?: TransactionDirection,
): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a valid number.')
  }

  const magnitude = Math.abs(amount)

  switch (type) {
    case 'EXPENSE':
      return -magnitude
    case 'INCOME':
    case 'REFUND':
    case 'REIMBURSEMENT':
      return magnitude
    case 'TRANSFER':
    case 'BALANCE_ADJUSTMENT': {
      if (direction !== 'in' && direction !== 'out') {
        throw new Error('Direction is required for this transaction type.')
      }
      return direction === 'in' ? magnitude : -magnitude
    }
    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

export function defaultDirectionForType(
  type: TransactionType,
): TransactionDirection {
  return type === 'BALANCE_ADJUSTMENT' ? 'in' : 'out'
}
