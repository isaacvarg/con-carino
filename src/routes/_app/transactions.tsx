import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/transactions')({
  component: TransactionsPage,
})

function TransactionsPage() {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">Transactions</h2>
        <p className="text-base-content/60">
          Browse and filter all of your transactions here.
        </p>
      </div>
    </div>
  )
}
