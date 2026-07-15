import { MOCK_EXPENSE_BREAKDOWN, formatCurrency } from './mock-data'

const DONUT_COLORS = [
  'stroke-secondary',
  'stroke-primary',
  'stroke-accent',
  'stroke-info',
  'stroke-warning',
] as const

const LEGEND_DOTS = [
  'bg-secondary',
  'bg-primary',
  'bg-accent',
  'bg-info',
  'bg-warning',
] as const

export function ExpenseStatistic() {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const total = MOCK_EXPENSE_BREAKDOWN.reduce((sum, item) => sum + item.amount, 0)

  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <h2 className="mb-4 font-semibold text-base-content">Statistic</h2>

      <div className="relative mx-auto mb-6 grid w-44 place-items-center">
        <svg viewBox="0 0 140 140" className="size-44 -rotate-90" aria-hidden="true">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            strokeWidth="16"
            className="stroke-base-200"
          />
          {MOCK_EXPENSE_BREAKDOWN.map((item, index) => {
            const length = (item.percent / 100) * circumference
            const dashOffset = offset
            offset += length
            return (
              <circle
                key={item.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                strokeWidth="16"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-dashOffset}
                strokeLinecap="butt"
                className={DONUT_COLORS[index % DONUT_COLORS.length]}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xs text-base-content/70">Total Expense</p>
            <p className="text-lg font-bold text-base-content">
              {formatCurrency(total)}
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-2.5">
        {MOCK_EXPENSE_BREAKDOWN.map((item, index) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-2 text-sm text-base-content"
          >
            <span className="inline-flex items-center gap-2 text-base-content">
              <span
                className={`size-2.5 rounded-sm ${LEGEND_DOTS[index % LEGEND_DOTS.length]}`}
              />
              {item.label}
            </span>
            <span className="font-medium text-base-content">
              {formatCurrency(item.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
