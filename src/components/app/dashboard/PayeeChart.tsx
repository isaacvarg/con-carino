import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { useEffect, useMemo, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import type { AccentName } from '#/lib/accents'
import type { CoverageAssigneeStat } from '#/server/care'
import type { TaxonomyTransactionStat } from '#/server/transactions'

ChartJS.register(ArcElement, Tooltip, Legend)

/**
 * Catppuccin accents ordered so consecutive slices sit in different hue
 * families — palette order (rosewater, flamingo, pink, …) puts near-identical
 * pastels next to each other and slices become indistinguishable.
 */
const CHART_ACCENT_ORDER: AccentName[] = [
  'blue',
  'peach',
  'green',
  'mauve',
  'red',
  'teal',
  'yellow',
  'pink',
  'sapphire',
  'maroon',
  'sky',
  'lavender',
  'flamingo',
  'rosewater',
]

const CHART_COLOR_FALLBACKS = CHART_ACCENT_ORDER.map(
  (accent) => `var(--ctp-${accent})`,
)

function resolveChartColors() {
  if (typeof window === 'undefined') {
    return CHART_COLOR_FALLBACKS
  }

  const styles = window.getComputedStyle(document.documentElement)
  return CHART_ACCENT_ORDER.map((accent, index) => {
    const color = styles.getPropertyValue(`--ctp-${accent}`).trim()
    return color || CHART_COLOR_FALLBACKS[index]
  })
}

function useCatppuccinChartColors() {
  const [colors, setColors] = useState(CHART_COLOR_FALLBACKS)

  useEffect(() => {
    const root = document.documentElement
    const refreshColors = () => setColors(resolveChartColors())

    refreshColors()

    const observer = new MutationObserver(refreshColors)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => observer.disconnect()
  }, [])

  return colors
}

export function StatisticDoughnutCard({
  title,
  stats,
  emptyMessage,
  centerLabel = 'Transactions',
}: {
  title: string
  stats: TaxonomyTransactionStat[]
  emptyMessage: string
  centerLabel?: string
}) {
  const chartColors = useCatppuccinChartColors()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const total = useMemo(
    () => stats.reduce((sum, item) => sum + item.count, 0),
    [stats],
  )

  const data: ChartData<'doughnut'> = useMemo(
    () => ({
      labels: stats.map((s) => s.name),
      datasets: [
        {
          data: stats.map((s) => s.count),
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
              return ` ${value} (${pct}%)`
            },
          },
        },
      },
    }),
    [total],
  )

  return (
    <div className="app-card p-5 text-base-content">
      <h2 className="mb-4 font-semibold text-base-content">{title}</h2>

      {stats.length === 0 || total === 0 ? (
        <p className="text-sm text-base-content/60">{emptyMessage}</p>
      ) : (
        <>
          <div className="relative mx-auto mb-6 grid w-40 place-items-center">
            {mounted ? (
              <Doughnut data={data} options={options} />
            ) : (
              <div className="size-40 rounded-full bg-base-200" aria-hidden />
            )}
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-xs text-base-content/70">{centerLabel}</p>
                <p className="text-lg font-bold text-base-content">{total}</p>
              </div>
            </div>
          </div>

          <ul className="max-h-40 space-y-2 overflow-y-auto pr-1">
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
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function PayeeStatistic({ stats }: { stats: TaxonomyTransactionStat[] }) {
  return (
    <StatisticDoughnutCard
      title="Payees"
      stats={stats}
      emptyMessage="No transaction payee data yet."
    />
  )
}

export function CoverageAssigneeCard({
  stats,
}: {
  stats: CoverageAssigneeStat[]
}) {
  const max = stats.reduce((m, s) => Math.max(m, s.count), 0)
  const total = stats.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="app-card p-5 text-base-content">
      <h2 className="mb-1 font-semibold text-base-content">Coverage</h2>
      <p className="mb-4 text-xs text-base-content/60">
        Assigned shifts this week and next
      </p>

      {stats.length === 0 || total === 0 ? (
        <p className="text-sm text-base-content/60">
          No assigned coverage this week or next.
        </p>
      ) : (
        <ul className="max-h-56 space-y-3 overflow-y-auto pr-1">
          {stats.map((item) => {
            const percent = max > 0 ? Math.round((item.count / max) * 100) : 0
            return (
              <li key={item.personId}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: item.bgColor ?? undefined,
                        color: item.textColor ?? undefined,
                      }}
                    >
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate font-medium text-base-content">
                      {item.name}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-base-content">
                    {item.count}
                  </span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={percent}
                  max={100}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
