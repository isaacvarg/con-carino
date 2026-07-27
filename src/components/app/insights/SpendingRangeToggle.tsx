import type { SpendingRange } from '#/server/transactions'

const RANGE_OPTIONS: Array<{ value: SpendingRange; label: string }> = [
  { value: 'month', label: 'This month' },
  { value: '30d', label: '30 days' },
  { value: '60d', label: '60 days' },
  { value: 'all', label: 'All time' },
]

export function SpendingRangeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: SpendingRange
  onChange: (range: SpendingRange) => void
  disabled?: boolean
}) {
  return (
    <div
      className="join flex flex-wrap rounded-full border border-base-300 bg-base-100"
      role="group"
      aria-label="Spending time range"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            className={[
              'btn btn-sm join-item h-8 min-h-0 px-2.5 text-xs font-medium',
              active
                ? 'btn-primary'
                : 'btn-ghost text-base-content disabled:bg-transparent',
            ].join(' ')}
            onClick={() => {
              if (!active) onChange(option.value)
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
