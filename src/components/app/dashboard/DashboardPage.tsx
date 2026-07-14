import { CashflowChart } from './CashflowChart'
import {
  BalanceCard,
  DailyLimitCard,
  MetricCards,
  QuickActions,
  SavingPlansCard,
} from './LeftColumn'
import { RecentTransactions } from './RecentTransactions'
import { ExpenseStatistic, RecentActivity } from './RightColumn'

export default function DashboardPage() {
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
        <RecentActivity />
      </div>
    </div>
  )
}
