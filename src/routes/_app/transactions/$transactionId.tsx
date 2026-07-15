import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { TransactionDetailPanel } from '#/components/app/transactions/TransactionDetailPanel'
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
    try {
      const transaction = await getTransaction({
        data: { id: params.transactionId },
      })
      return { transaction }
    } catch {
      throw notFound()
    }
  },
  component: TransactionDetailPage,
})

function TransactionDetailPage() {
  const { transaction } = Route.useLoaderData()
  return <TransactionDetailPanel transaction={transaction} />
}
