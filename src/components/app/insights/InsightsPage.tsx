import { useEffect, useMemo, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import type { AccountListItem } from '#/server/accounts'
import {
  getSpendingByCategory,
  getSpendingByPayee,
  type SpendingRange,
  type SpendingStat,
} from '#/server/transactions'
import { AmountDoughnutCard } from './AmountDoughnutCard'
import { SpendingRangeToggle } from './SpendingRangeToggle'

function positiveBalanceStats(accounts: AccountListItem[]) {
  return accounts
    .map((account) => ({
      id: account.id,
      name: account.name,
      amount: Number(account.currentBalance),
    }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

function SpendingChartCard({
  title,
  emptyMessage,
  initialStats,
  fetchStats,
}: {
  title: string
  emptyMessage: string
  initialStats: SpendingStat[]
  fetchStats: (range: SpendingRange) => Promise<SpendingStat[]>
}) {
  const [range, setRange] = useState<SpendingRange>('month')
  const [stats, setStats] = useState(initialStats)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setStats(initialStats)
  }, [initialStats])

  async function handleRangeChange(next: SpendingRange) {
    setRange(next)
    setLoading(true)
    try {
      const nextStats = await fetchStats(next)
      setStats(nextStats)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AmountDoughnutCard
      title={title}
      stats={stats}
      emptyMessage={emptyMessage}
      centerLabel="Spent"
      headerAccessory={
        <SpendingRangeToggle
          value={range}
          onChange={handleRangeChange}
          disabled={loading}
        />
      }
    />
  )
}

export default function InsightsPage({
  accounts,
  categorySpending,
  payeeSpending,
}: {
  accounts: AccountListItem[]
  categorySpending: SpendingStat[]
  payeeSpending: SpendingStat[]
}) {
  const getCategorySpendingFn = useServerFn(getSpendingByCategory)
  const getPayeeSpendingFn = useServerFn(getSpendingByPayee)

  const balanceStats = useMemo(
    () => positiveBalanceStats(accounts),
    [accounts],
  )

  return (
    <div className="flex flex-col gap-4">
      <AmountDoughnutCard
        title="Account balances"
        stats={balanceStats}
        emptyMessage="No accounts with a positive balance yet."
        centerLabel="Balances"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendingChartCard
          title="Spending by category"
          emptyMessage="No spending in this range yet."
          initialStats={categorySpending}
          fetchStats={(range) => getCategorySpendingFn({ data: { range } })}
        />
        <SpendingChartCard
          title="Spending by payee"
          emptyMessage="No spending in this range yet."
          initialStats={payeeSpending}
          fetchStats={(range) => getPayeeSpendingFn({ data: { range } })}
        />
      </div>
    </div>
  )
}
