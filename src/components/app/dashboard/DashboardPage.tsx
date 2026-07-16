import { DashboardRecentActivity } from '#/components/app/activity/ActivityViews'
import type { AccountListItem } from '#/server/accounts'
import type { ActivityListItem } from '#/server/activity'
import type {
  CoverageAssigneeStat,
  OpenCoverageSlotDto,
} from '#/server/care'
import type {
  TaxonomyTransactionStat,
  VisibleTransactionListItem,
} from '#/server/transactions'
import {
  AccountBalanceCards,
  DashboardFeedbackCard,
  OpenCoverageSlotsCard,
  QuickActions,
} from './LeftColumn'
import {
  CoverageAssigneeCard,
  StatisticDoughnutCard,
} from './PayeeChart'
import { RecentTransactions } from './RecentTransactions'

export default function DashboardPage({
  accounts,
  recentTransactions,
  payeeStats,
  categoryStats,
  tagStats,
  coverageAssigneeStats,
  openCoverageSlots,
  recentActivity,
}: {
  accounts: AccountListItem[]
  recentTransactions: VisibleTransactionListItem[]
  payeeStats: TaxonomyTransactionStat[]
  categoryStats: TaxonomyTransactionStat[]
  tagStats: TaxonomyTransactionStat[]
  coverageAssigneeStats: CoverageAssigneeStat[]
  openCoverageSlots: OpenCoverageSlotDto[]
  recentActivity: ActivityListItem[]
}) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[17.5rem_minmax(0,1fr)_22rem]">
      <div className="order-1 xl:order-none xl:col-start-1 xl:row-start-1">
        <QuickActions />
      </div>

      <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-none xl:col-start-2 xl:row-start-1 xl:row-span-2">
        <AccountBalanceCards accounts={accounts} />
        <RecentTransactions transactions={recentTransactions} />
        <div className="h-[24rem]">
          <DashboardRecentActivity items={recentActivity} expanded />
        </div>
      </div>

      <div className="order-3 flex flex-col gap-4 xl:order-none xl:col-start-1 xl:row-start-2">
        <OpenCoverageSlotsCard slots={openCoverageSlots} />
        <DashboardFeedbackCard />
      </div>

      <aside className="order-4 flex w-full min-w-0 flex-col gap-4 xl:order-none xl:col-start-3 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <StatisticDoughnutCard
          title="Payees"
          stats={payeeStats}
          emptyMessage="No transaction payee data yet."
        />
        <StatisticDoughnutCard
          title="Categories"
          stats={categoryStats}
          emptyMessage="No transaction category data yet."
        />
        <StatisticDoughnutCard
          title="Tags"
          stats={tagStats}
          emptyMessage="No transaction tag data yet."
        />
        <CoverageAssigneeCard stats={coverageAssigneeStats} />
      </aside>
    </div>
  )
}
