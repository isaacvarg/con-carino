import {
  MOCK_TRANSACTIONS,
  type TransactionStatus,
} from './mock-data'

function statusClass(status: TransactionStatus): string {
  switch (status) {
    case 'Completed':
      return 'badge-success text-success-content'
    case 'Pending':
      return 'badge-warning text-warning-content'
    case 'Failed':
      return 'badge-error text-error-content'
  }
}

export function RecentTransactions() {
  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base-content">Recent Transactions</h2>
        <button
          type="button"
          className="btn btn-ghost btn-xs text-base-content"
        >
          View all
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr className="text-base-content/70">
              <th>Transaction Name</th>
              <th>Date & Time</th>
              <th>Amount</th>
              <th>Note</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_TRANSACTIONS.map((tx) => (
              <tr key={`${tx.name}-${tx.date}`} className="text-base-content">
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-content">
                      {tx.name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="font-medium text-base-content">{tx.name}</p>
                      <p className="text-xs text-base-content/70">
                        {tx.category}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="text-sm text-base-content/70">{tx.date}</td>
                <td
                  className={`font-semibold ${
                    tx.amount.startsWith('-')
                      ? 'text-error'
                      : 'text-base-content'
                  }`}
                >
                  {tx.amount}
                </td>
                <td className="text-sm text-base-content/70">{tx.note}</td>
                <td>
                  <span className={`badge badge-sm ${statusClass(tx.status)}`}>
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
