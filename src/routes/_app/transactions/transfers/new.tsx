import { createFileRoute } from '@tanstack/react-router'
import { AddTransferForm } from '#/components/app/accounts/AddTransferForm'
import { listAccounts } from '#/server/accounts'

export const Route = createFileRoute('/_app/transactions/transfers/new')({
  loader: async () => {
    const accounts = await listAccounts()
    return { accounts }
  },
  component: NewTransferPage,
})

function NewTransferPage() {
  const { accounts } = Route.useLoaderData()
  const defaultFromAccountId = accounts[0]?.id ?? ''

  return (
    <AddTransferForm
      accounts={accounts}
      defaultFromAccountId={defaultFromAccountId}
    />
  )
}
