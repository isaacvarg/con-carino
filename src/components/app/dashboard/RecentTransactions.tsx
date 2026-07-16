import { Link } from '@tanstack/react-router'
import type { ReconciliationStatus } from '#/generated/prisma/enums'
import {
  formatAccountCurrency,
  formatTransactionDate,
} from '#/components/app/accounts/account-utils'
import { transactionsSearchDefaults } from '#/components/app/transactions/transactions-search'
import type { VisibleTransactionListItem } from '#/server/transactions'

function statusLabel(status: ReconciliationStatus): string {
  switch (status) {
    case 'CLEARED':
      return 'Cleared'
    case 'NEEDS_REVIEW':
      return 'Needs review'
    case 'RECONCILED':
      return 'Reconciled'
    case 'UNCLEARED':
    default:
      return 'Uncleared'
  }
}

function statusClass(status: ReconciliationStatus): string {
  switch (status) {
    case 'CLEARED':
      return 'badge-success text-success-content'
    case 'NEEDS_REVIEW':
      return 'badge-warning text-warning-content'
    case 'RECONCILED':
      return 'badge-info text-info-content'
    case 'UNCLEARED':
    default:
      return 'badge-ghost'
  }
}

function transactionTitle(tx: VisibleTransactionListItem): string {
  return tx.payee?.name?.trim() || tx.description?.trim() || 'Transaction'
}

export function RecentTransactions({
  transactions,
}: {
  transactions: VisibleTransactionListItem[]
}) {
  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base-content">Recent Transactions</h2>
        <Link
          to="/transactions"
          search={transactionsSearchDefaults}
          className="btn btn-ghost btn-xs text-base-content"
        >
          View all
        </Link>
      </div>

      {transactions.length === 0 ? (
        <p className="text-sm text-base-content/60">No transactions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-base-content/70">
                <th>Transaction</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Account</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const title = transactionTitle(tx)
                const amount = Number(tx.amount)
                const isNegative = Number.isFinite(amount) && amount < 0
                return (
                  <tr key={tx.id} className="text-base-content">
                    <td>
                      <Link
                        to="/transactions/$transactionId"
                        params={{ transactionId: tx.id }}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-content">
                          {title.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-medium text-base-content">
                            {title}
                          </p>
                          <p className="text-xs text-base-content/70">
                            {tx.category?.name ?? tx.type}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="text-sm text-base-content/70">
                      {formatTransactionDate(tx.date)}
                    </td>
                    <td
                      className={`font-semibold ${
                        isNegative ? 'text-error' : 'text-base-content'
                      }`}
                    >
                      {formatAccountCurrency(tx.amount)}
                    </td>
                    <td className="text-sm text-base-content/70">
                      {tx.account.name}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${statusClass(tx.reconciliationStatus)}`}
                      >
                        {statusLabel(tx.reconciliationStatus)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
