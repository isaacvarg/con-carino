import { MOCK_CASHFLOW } from './mock-data'

const MAX_VALUE = Math.max(
  ...MOCK_CASHFLOW.flatMap((row) => [row.income, row.expense]),
)

export function CashflowChart() {
  const chartHeight = 180
  const barWidth = 14
  const gap = 18
  const groupWidth = barWidth * 2 + 4
  const width = MOCK_CASHFLOW.length * (groupWidth + gap)

  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-base-content">Cashflow</h2>
        <div className="flex items-center gap-4 text-xs text-base-content/70">
          <span className="inline-flex items-center gap-1.5 text-base-content">
            <span className="size-2.5 rounded-sm bg-secondary" />
            Income
          </span>
          <span className="inline-flex items-center gap-1.5 text-base-content">
            <span className="size-2.5 rounded-sm bg-primary" />
            Expense
          </span>
          <select
            className="select select-bordered select-xs text-base-content"
            defaultValue="this-year"
            aria-label="Cashflow period"
          >
            <option value="this-year">This Year</option>
            <option value="last-year">Last Year</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto text-base-content/70">
        <svg
          viewBox={`0 0 ${width} ${chartHeight + 28}`}
          className="min-w-full"
          role="img"
          aria-label="Monthly income and expense bar chart"
        >
          {MOCK_CASHFLOW.map((row, index) => {
            const x = index * (groupWidth + gap) + gap / 2
            const incomeHeight = (row.income / MAX_VALUE) * chartHeight
            const expenseHeight = (row.expense / MAX_VALUE) * chartHeight

            return (
              <g key={row.month}>
                <rect
                  x={x}
                  y={chartHeight - incomeHeight}
                  width={barWidth}
                  height={incomeHeight}
                  rx={4}
                  className="fill-secondary"
                />
                <rect
                  x={x + barWidth + 4}
                  y={chartHeight - expenseHeight}
                  width={barWidth}
                  height={expenseHeight}
                  rx={4}
                  className="fill-primary"
                />
                <text
                  x={x + groupWidth / 2}
                  y={chartHeight + 18}
                  textAnchor="middle"
                  className="fill-current text-[10px]"
                >
                  {row.month}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
