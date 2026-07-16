import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ReconciliationMode } from '#/components/app/accounts/ReconciliationMode'
import { TransactionsTable } from '#/components/app/accounts/TransactionsTable'
import { validateAccountTransactionsSearch } from '#/components/app/accounts/account-detail-search'
import { listPayees } from '#/server/taxonomies'
import {
  getAccountCurrentBalance,
  listAccountTransactions,
} from '#/server/transactions'

const accountRoute = getRouteApi('/_app/accounts/$accountId')

export const Route = createFileRoute('/_app/accounts/$accountId/')({
  validateSearch: validateAccountTransactionsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode }),
  loader: async ({ params, deps }) => {
    const [transactions, balance, payees] = await Promise.all([
      listAccountTransactions({ data: { accountId: params.accountId } }),
      getAccountCurrentBalance({ data: { accountId: params.accountId } }),
      deps.mode === 'reconcile' ? listPayees() : Promise.resolve([]),
    ])
    return {
      transactions,
      currentBalance: balance.currentBalance,
      payees,
    }
  },
  component: AccountDetailsPage,
})

function AccountDetailsPage() {
  const { accountId } = Route.useParams()
  const account = accountRoute.useLoaderData()
  const { transactions, currentBalance, payees } = Route.useLoaderData()
  const search = Route.useSearch()

  if (search.mode === 'reconcile') {
    return (
      <ReconciliationMode
        accountId={accountId}
        transactions={transactions}
        payees={payees}
        search={search}
      />
    )
  }

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
