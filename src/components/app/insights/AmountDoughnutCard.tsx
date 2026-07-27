import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { useCatppuccinChartColors } from '#/components/app/charts/chart-colors'
import { formatAccountCurrency } from '#/components/app/accounts/account-utils'

ChartJS.register(ArcElement, Tooltip, Legend)

export type AmountStat = {
  id: string | null
  name: string
  amount: number
}

export function AmountDoughnutCard({
  title,
  stats,
  emptyMessage,
  centerLabel,
  headerAccessory,
}: {
  title: string
  stats: AmountStat[]
  emptyMessage: string
  centerLabel: string
  headerAccessory?: ReactNode
}) {
  const chartColors = useCatppuccinChartColors()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const total = useMemo(
    () => stats.reduce((sum, item) => sum + item.amount, 0),
    [stats],
  )

  const data: ChartData<'doughnut'> = useMemo(
    () => ({
      labels: stats.map((s) => s.name),
      datasets: [
        {
          data: stats.map((s) => s.amount),
          backgroundColor: stats.map(
            (_, i) => chartColors[i % chartColors.length],
          ),
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    }),
    [chartColors, stats],
  )

  const options: ChartOptions<'doughnut'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = typeof ctx.raw === 'number' ? ctx.raw : 0
              const pct = total > 0 ? Math.round((value / total) * 100) : 0
              return ` ${formatAccountCurrency(value)} (${pct}%)`
            },
          },
        },
      },
    }),
    [total],
  )

  return (
    <div className="app-card p-5 text-base-content">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="font-semibold text-base-content">{title}</h2>
        {headerAccessory}
      </div>

      {stats.length === 0 || total <= 0 ? (
        <p className="text-sm text-base-content/60">{emptyMessage}</p>
      ) : (
        <>
          <div className="relative mx-auto mb-6 grid w-44 place-items-center">
            {mounted ? (
              <Doughnut data={data} options={options} />
            ) : (
              <div className="size-44 rounded-full bg-base-200" aria-hidden />
            )}
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-3 text-center">
              <div>
                <p className="text-xs text-base-content/70">{centerLabel}</p>
                <p className="text-base font-bold leading-tight text-base-content">
                  {formatAccountCurrency(total)}
                </p>
              </div>
            </div>
          </div>

          <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {stats.map((item, index) => (
              <li
                key={`${item.id ?? 'none'}-${item.name}`}
                className="flex items-center justify-between gap-2 text-sm text-base-content"
              >
                <span className="inline-flex min-w-0 items-center gap-2 text-base-content">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: chartColors[index % chartColors.length],
                    }}
                  />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0 font-medium text-base-content">
                  {formatAccountCurrency(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
