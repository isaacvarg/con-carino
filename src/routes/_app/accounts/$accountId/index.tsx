import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { TransactionsTable } from '#/components/app/accounts/TransactionsTable'
import { validateAccountTransactionsSearch } from '#/components/app/accounts/account-detail-search'
import {
  getAccountCurrentBalance,
  listAccountTransactions,
} from '#/server/transactions'

const accountRoute = getRouteApi('/_app/accounts/$accountId')

export const Route = createFileRoute('/_app/accounts/$accountId/')({
  validateSearch: validateAccountTransactionsSearch,
  loader: async ({ params }) => {
    const [transactions, balance] = await Promise.all([
      listAccountTransactions({ data: { accountId: params.accountId } }),
      getAccountCurrentBalance({ data: { accountId: params.accountId } }),
    ])
    return {
      transactions,
      currentBalance: balance.currentBalance,
    }
  },
  component: AccountDetailsPage,
})

function AccountDetailsPage() {
  const { accountId } = Route.useParams()
  const account = accountRoute.useLoaderData()
  const { transactions, currentBalance } = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <TransactionsTable
      accountId={accountId}
      openingBalance={account.initialBalance}
      currentBalance={currentBalance}
      transactions={transactions}
      search={search}
    />
  )
}
