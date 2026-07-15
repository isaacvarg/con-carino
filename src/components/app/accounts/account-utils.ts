import type { AccountType } from '#/generated/prisma/enums'
import type { TransactionType } from '#/generated/prisma/enums'

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'CHECKING', label: 'Checking' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CREDIT_CARD', label: 'Credit card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'LOAN', label: 'Loan' },
]

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: 'Expense',
  INCOME: 'Income',
  TRANSFER: 'Transfer',
  BALANCE_ADJUSTMENT: 'Balance adjustment',
  REFUND: 'Refund',
  REIMBURSEMENT: 'Reimbursement',
}

/** Types offered on the generic add-transaction form (not transfers). */
export const TRANSACTION_TYPE_OPTIONS: {
  value: Exclude<TransactionType, 'TRANSFER'>
  label: string
}[] = [
  { value: 'EXPENSE', label: TRANSACTION_TYPE_LABELS.EXPENSE },
  { value: 'INCOME', label: TRANSACTION_TYPE_LABELS.INCOME },
  {
    value: 'BALANCE_ADJUSTMENT',
    label: TRANSACTION_TYPE_LABELS.BALANCE_ADJUSTMENT,
  },
  { value: 'REFUND', label: TRANSACTION_TYPE_LABELS.REFUND },
  { value: 'REIMBURSEMENT', label: TRANSACTION_TYPE_LABELS.REIMBURSEMENT },
]

export function accountTypeLabel(type: AccountType): string {
  return (
    ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  )
}

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type
}

export function formatAccountCurrency(value: string | number): string {
  const amount = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(amount)) {
    return '$0.00'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatTransactionDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function todayDateInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
