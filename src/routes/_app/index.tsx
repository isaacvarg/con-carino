import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardPage from '#/components/app/dashboard/DashboardPage'
import { listAccounts } from '#/server/accounts'
import { listRecentActivity } from '#/server/activity'
import {
  getCoverageAssigneeStats,
  listOpenCoverageSlots,
} from '#/server/care'
import {
  getCategoryTransactionStats,
  getPayeeTransactionStats,
  getTagTransactionStats,
  listRecentTransactions,
} from '#/server/transactions'

export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  loader: async () => {
    const [
      accounts,
      recentTransactions,
      payeeStats,
      categoryStats,
      tagStats,
      coverageAssigneeStats,
      openCoverageSlots,
      recentActivity,
    ] = await Promise.all([
      listAccounts(),
      listRecentTransactions({ data: { take: 8 } }),
      getPayeeTransactionStats(),
      getCategoryTransactionStats(),
      getTagTransactionStats(),
      getCoverageAssigneeStats(),
      listOpenCoverageSlots(),
      listRecentActivity({ data: { take: 8 } }),
    ])

    return {
      accounts,
      recentTransactions,
      payeeStats,
      categoryStats,
      tagStats,
      coverageAssigneeStats,
      openCoverageSlots,
      recentActivity,
    }
  },
  component: DashboardRoute,
})

function DashboardRoute() {
  const data = Route.useLoaderData()
  return <DashboardPage {...data} />
}
