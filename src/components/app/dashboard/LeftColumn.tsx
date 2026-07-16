import { Link } from '@tanstack/react-router'
import {
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineSwitchHorizontal,
  HiPlus,
} from 'react-icons/hi'
import {
  accountTypeLabel,
  formatAccountCurrency,
} from '#/components/app/accounts/account-utils'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import { toDateInputValue } from '#/components/app/care/care-utils'
import type { AccountListItem } from '#/server/accounts'
import type { OpenCoverageSlotDto } from '#/server/care'

function currentScheduleSearch() {
  const now = new Date()
  return {
    tab: 'calendar' as const,
    year: now.getFullYear(),
    month: now.getMonth(),
    day: toDateInputValue(now),
  }
}

const QUICK_ACTIONS = [
  {
    id: 'transaction',
    label: 'Transaction',
    to: '/transactions/new' as const,
    Icon: HiPlus,
  },
  {
    id: 'transfer',
    label: 'Transfer',
    to: '/transactions/transfers/new' as const,
    Icon: HiOutlineSwitchHorizontal,
  },
  {
    id: 'event',
    label: 'Event',
    to: '/schedule' as const,
    Icon: HiOutlineCalendar,
  },
  {
    id: 'history',
    label: 'History',
    to: '/activity' as const,
    Icon: HiOutlineClock,
  },
] as const

const actionBtnClass =
  'btn btn-soft btn-primary h-auto min-h-0 w-full flex-col gap-1.5 whitespace-nowrap px-2 py-3 text-xs font-medium'

export function QuickActions() {
  const scheduleSearch = currentScheduleSearch()

  return (
    <div className="grid grid-cols-2 gap-2">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.Icon
        if (action.to === '/schedule') {
          return (
            <Link
              key={action.id}
              to="/schedule"
              search={scheduleSearch}
              className={actionBtnClass}
            >
              <Icon className="size-5" aria-hidden />
              {action.label}
            </Link>
          )
        }
        return (
          <Link key={action.id} to={action.to} className={actionBtnClass}>
            <Icon className="size-5" aria-hidden />
            {action.label}
          </Link>
        )
      })}
    </div>
  )
}

export function AccountBalanceCards({
  accounts,
}: {
  accounts: AccountListItem[]
}) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-box bg-base-100 p-4 text-base-content shadow-sm">
        <p className="text-sm text-base-content/70">No accounts yet.</p>
        <Link
          to="/accounts/new"
          className="link link-primary mt-2 inline-block text-sm"
        >
          Add an account
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => (
        <Link
          key={account.id}
          to="/accounts/$accountId"
          params={{ accountId: account.id }}
          search={accountDetailSearchDefaults}
          className="rounded-box bg-base-100 p-4 text-base-content shadow-sm transition hover:bg-base-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <p className="truncate text-sm text-base-content/70">{account.name}</p>
          <p className="mt-1 text-xs text-base-content/50">
            {accountTypeLabel(account.type)}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-base-content">
            {formatAccountCurrency(account.currentBalance)}
          </p>
        </Link>
      ))}
    </div>
  )
}

function formatSlotDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatSlotTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`
}

export function OpenCoverageSlotsCard({
  slots,
}: {
  slots: OpenCoverageSlotDto[]
}) {
  const scheduleSearch = currentScheduleSearch()

  return (
    <div className="rounded-box bg-base-100 p-5 text-base-content shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-base-content">Open coverage</h2>
        <Link
          to="/schedule"
          search={scheduleSearch}
          className="link link-hover text-xs text-base-content/60"
        >
          View schedule
        </Link>
      </div>
      {slots.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No open coverage this week or next.
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="rounded-box bg-base-200 px-3 py-2.5 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-base-content">
                  {formatSlotDay(slot.startsAt)}
                </p>
                {slot.isRequired ? (
                  <span className="badge badge-primary badge-sm shrink-0">
                    Required
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-base-content/80">
                {formatSlotTimeRange(slot.startsAt, slot.endsAt)}
              </p>
              <p className="mt-0.5 text-xs text-base-content/60">
                {slot.seriesNotes?.trim() ||
                  slot.notes?.trim() ||
                  (slot.isRequired ? 'Required coverage' : 'Open slot')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
