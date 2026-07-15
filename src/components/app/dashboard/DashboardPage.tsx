import { DashboardRecentActivity } from '#/components/app/activity/ActivityViews'
import type { ActivityListItem } from '#/server/activity'
import { CashflowChart } from './CashflowChart'
import {
  BalanceCard,
  DailyLimitCard,
  MetricCards,
  QuickActions,
  SavingPlansCard,
} from './LeftColumn'
import { RecentTransactions } from './RecentTransactions'
import { ExpenseStatistic } from './RightColumn'

export default function DashboardPage({
  recentActivity,
}: {
  recentActivity: ActivityListItem[]
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[17.5rem_minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-4">
        <BalanceCard />
        <QuickActions />
        <DailyLimitCard />
        <SavingPlansCard />
      </div>

      <div className="flex flex-col gap-4">
        <MetricCards />
        <CashflowChart />
        <RecentTransactions />
      </div>

      <div className="flex flex-col gap-4">
        <ExpenseStatistic />
        <DashboardRecentActivity items={recentActivity} />
      </div>
    </div>
  )
}
