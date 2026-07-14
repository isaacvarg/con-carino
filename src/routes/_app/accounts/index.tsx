import { createFileRoute } from '@tanstack/react-router'
import { AccountsPage } from '#/components/app/accounts/AccountsPage'
import { listAccounts } from '#/server/accounts'

export const Route = createFileRoute('/_app/accounts/')({
  loader: () => listAccounts(),
  component: AccountsRoute,
})

function AccountsRoute() {
  const accounts = Route.useLoaderData()
  return <AccountsPage accounts={accounts} />
}
