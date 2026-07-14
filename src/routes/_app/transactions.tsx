import { createFileRoute, redirect } from '@tanstack/react-router'
import { AllTransactionsTable } from '#/components/app/transactions/AllTransactionsTable'
import { validateTransactionsSearch } from '#/components/app/transactions/transactions-search'
import { listVisibleTransactions } from '#/server/transactions'

export const Route = createFileRoute('/_app/transactions')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  validateSearch: validateTransactionsSearch,
  loader: async () => {
    const transactions = await listVisibleTransactions()
    return { transactions }
  },
  component: TransactionsPage,
})

function TransactionsPage() {
  const { transactions } = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <AllTransactionsTable transactions={transactions} search={search} />
  )
}
