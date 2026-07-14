import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AddTransferForm } from '#/components/app/accounts/AddTransferForm'
import { listAccounts } from '#/server/accounts'

const accountRoute = getRouteApi('/_app/accounts/$accountId')

export const Route = createFileRoute(
  '/_app/accounts/$accountId/transfers/new',
)({
  loader: async () => {
    const accounts = await listAccounts()
    return { accounts }
  },
  component: NewTransferPage,
})

function NewTransferPage() {
  const { accountId } = accountRoute.useParams()
  const { accounts } = Route.useLoaderData()

  return (
    <AddTransferForm
      returnAccountId={accountId}
      accounts={accounts}
      defaultFromAccountId={accountId}
    />
  )
}
