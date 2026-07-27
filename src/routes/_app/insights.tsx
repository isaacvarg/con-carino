import { createFileRoute, redirect } from '@tanstack/react-router'
import InsightsPage from '#/components/app/insights/InsightsPage'
import { listAccounts } from '#/server/accounts'
import {
  getSpendingByCategory,
  getSpendingByPayee,
} from '#/server/transactions'

export const Route = createFileRoute('/_app/insights')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  loader: async () => {
    const [accounts, categorySpending, payeeSpending] = await Promise.all([
      listAccounts(),
      getSpendingByCategory({ data: { range: 'month' } }),
      getSpendingByPayee({ data: { range: 'month' } }),
    ])

    return { accounts, categorySpending, payeeSpending }
  },
  component: InsightsRoute,
})

function InsightsRoute() {
  const data = Route.useLoaderData()
  return <InsightsPage {...data} />
}
