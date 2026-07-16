import { createFileRoute } from '@tanstack/react-router'
import { AddTransactionForm } from '#/components/app/accounts/AddTransactionForm'
import { listAccounts } from '#/server/accounts'
import {
  listCategories,
  listPayees,
  listTags,
} from '#/server/taxonomies'

export const Route = createFileRoute('/_app/transactions/new')({
  loader: async () => {
    const [accounts, payees, categories, tags] = await Promise.all([
      listAccounts(),
      listPayees(),
      listCategories(),
      listTags(),
    ])
    return { accounts, payees, categories, tags }
  },
  component: NewTransactionPage,
})

function NewTransactionPage() {
  const { accounts, payees, categories, tags } = Route.useLoaderData()

  return (
    <AddTransactionForm
      accounts={accounts}
      payees={payees}
      categories={categories}
      tags={tags}
    />
  )
}
