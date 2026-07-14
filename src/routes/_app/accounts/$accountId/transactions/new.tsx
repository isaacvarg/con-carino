import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AddTransactionForm } from '#/components/app/accounts/AddTransactionForm'
import {
  listCategories,
  listPayees,
  listTags,
} from '#/server/taxonomies'

const accountRoute = getRouteApi('/_app/accounts/$accountId')

export const Route = createFileRoute(
  '/_app/accounts/$accountId/transactions/new',
)({
  loader: async () => {
    const [payees, categories, tags] = await Promise.all([
      listPayees(),
      listCategories(),
      listTags(),
    ])
    return { payees, categories, tags }
  },
  component: NewTransactionPage,
})

function NewTransactionPage() {
  const account = accountRoute.useLoaderData()
  const { payees, categories, tags } = Route.useLoaderData()

  return (
    <AddTransactionForm
      account={account}
      payees={payees}
      categories={categories}
      tags={tags}
    />
  )
}
