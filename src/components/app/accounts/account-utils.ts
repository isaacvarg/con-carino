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

export const TRANSACTION_TYPE_OPTIONS: {
  value: TransactionType
  label: string
}[] = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'BALANCE_ADJUSTMENT', label: 'Balance adjustment' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement' },
]

export function accountTypeLabel(type: AccountType): string {
  return (
    ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  )
}

export function transactionTypeLabel(type: TransactionType): string {
  return (
    TRANSACTION_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    type
  )
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
  }).format(date)
}

export function todayDateInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
