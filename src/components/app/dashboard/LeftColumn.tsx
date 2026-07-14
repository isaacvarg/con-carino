import {
  HiArrowDown,
  HiOutlineClock,
  HiOutlineSwitchHorizontal,
  HiPlus,
} from 'react-icons/hi'
import { MdOutlineContactless } from 'react-icons/md'
import {
  MOCK_BALANCE,
  MOCK_DAILY_LIMIT,
  MOCK_METRICS,
  MOCK_QUICK_ACTIONS,
  MOCK_SAVING_PLANS,
  formatCurrency,
} from './mock-data'

const QUICK_ACTION_ICONS = {
  'top-up': HiPlus,
  transfer: HiOutlineSwitchHorizontal,
  request: HiArrowDown,
  history: HiOutlineClock,
} as const

export function BalanceCard() {
  return (
    <div className="relative overflow-hidden rounded-box bg-secondary p-5 text-secondary-content shadow-sm">
      <div
        className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-primary/20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-6 size-36 rounded-full bg-primary/10"
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-secondary-content/80">{MOCK_BALANCE.name}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-secondary-content/70">
            Balance
          </p>
          <p className="text-3xl font-bold tracking-tight text-secondary-content">
            {formatCurrency(MOCK_BALANCE.balance)}
          </p>
        </div>
        <MdOutlineContactless
          className="size-6 text-secondary-content"
          aria-hidden
        />
      </div>
      <div className="relative mt-8 flex gap-8 text-sm">
        <div>
          <p className="text-secondary-content/70">Expiry Date</p>
          <p className="font-semibold text-secondary-content">
            {MOCK_BALANCE.expiry}
          </p>
        </div>
        <div>
          <p className="text-secondary-content/70">CVV</p>
          <p className="font-semibold text-secondary-content">
            {MOCK_BALANCE.cvv}
          </p>
        </div>
      </div>
    </div>
  )
}

export function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MOCK_QUICK_ACTIONS.map((action) => {
        const Icon = QUICK_ACTION_ICONS[action.id]
        return (
          <button
            key={action.id}
            type="button"
            className="flex flex-col items-center gap-2 rounded-box bg-base-100 p-3 text-xs font-medium text-base-content shadow-sm transition hover:bg-base-200"
          >
            <span className="grid size-10 place-items-center rounded-full border border-base-300 bg-base-100 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="text-base-content">{action.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function DailyLimitCard() {
  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base-content">Daily Limit</h2>
        <span className="text-sm font-semibold text-primary">
          {MOCK_DAILY_LIMIT.percent}%
        </span>
      </div>
      <progress
        className="progress progress-primary w-full"
        value={MOCK_DAILY_LIMIT.percent}
        max={100}
      />
      <p className="mt-3 text-sm text-base-content/70">
        <span className="font-semibold text-base-content">
          {formatCurrency(MOCK_DAILY_LIMIT.spent)}
        </span>{' '}
        spent of {formatCurrency(MOCK_DAILY_LIMIT.limit)}
      </p>
    </div>
  )
}

export function SavingPlansCard() {
  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base-content">Saving Plans</h2>
        <p className="text-sm text-base-content/70">
          Total{' '}
          <span className="font-semibold text-base-content">
            {formatCurrency(84_500)}
          </span>
        </p>
      </div>
      <ul className="space-y-4">
        {MOCK_SAVING_PLANS.map((plan) => (
          <li key={plan.name}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-base-content">{plan.name}</span>
              <span className="text-base-content/70">{plan.percent}%</span>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={plan.percent}
              max={100}
            />
            <div className="mt-1 flex justify-between text-xs text-base-content/70">
              <span>{formatCurrency(plan.current)}</span>
              <span>Goal {formatCurrency(plan.target)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MetricCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {MOCK_METRICS.map((metric) => (
        <div
          key={metric.label}
          className="rounded-box bg-base-100 p-4 text-base-content shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-base-content/70">{metric.label}</p>
            <span
              className={`badge badge-sm gap-1 border-0 ${
                metric.trend.direction === 'up'
                  ? 'bg-success/15 text-success'
                  : 'bg-error/15 text-error'
              }`}
            >
              {metric.trend.label}
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-base-content">
            {formatCurrency(metric.amount)}
          </p>
        </div>
      ))}
    </div>
  )
}
