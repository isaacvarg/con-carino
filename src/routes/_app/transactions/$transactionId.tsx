import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { TransactionDetailPanel } from '#/components/app/transactions/TransactionDetailPanel'
import { listTransactionActivity } from '#/server/activity'
import {
  listCategories,
  listPayees,
  listTags,
} from '#/server/taxonomies'
import { getTransaction } from '#/server/transactions'

export const Route = createFileRoute('/_app/transactions/$transactionId')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  loader: async ({ params }) => {
    let transaction
    try {
      transaction = await getTransaction({
        data: { id: params.transactionId },
      })
    } catch {
      throw notFound()
    }

    const [activity, payees, categories, tags] = await Promise.all([
      listTransactionActivity({
        data: { transactionId: params.transactionId },
      }),
      listPayees(),
      listCategories(),
      listTags(),
    ])

    return { transaction, activity, payees, categories, tags }
  },
  component: TransactionDetailPage,
})

function TransactionDetailPage() {
  const { transaction, activity, payees, categories, tags } =
    Route.useLoaderData()
  return (
    <TransactionDetailPanel
      transaction={transaction}
      activity={activity}
      payees={payees}
      categories={categories}
      tags={tags}
    />
  )
}
