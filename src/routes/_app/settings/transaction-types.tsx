import { createFileRoute, redirect } from '@tanstack/react-router'
import { TransactionTypesSettingsPanel } from '#/components/app/settings/TransactionTypesSettingsPanel'
import {
  listTransactionTypes,
  listTransactionTypeUsage,
} from '#/server/transaction-types'

export const Route = createFileRoute('/_app/settings/transaction-types')({
  beforeLoad: ({ context }) => {
    if (!context.session?.user?.isAdmin) {
      throw redirect({ to: '/settings' })
    }
  },
  loader: async () => {
    const [types, usage] = await Promise.all([
      listTransactionTypes(),
      listTransactionTypeUsage(),
    ])
    return { types, usage }
  },
  component: SettingsTransactionTypesPage,
})

function SettingsTransactionTypesPage() {
  const { types, usage } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <TransactionTypesSettingsPanel types={types} usage={usage} />
    </div>
  )
}
