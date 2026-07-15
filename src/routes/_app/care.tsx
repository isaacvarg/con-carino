import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  defaultCalendarMonth,
  type CareTab,
} from '#/components/app/care/CarePage'

const TABS = new Set<CareTab>(['calendar', 'swaps'])

export const Route = createFileRoute('/_app/care')({
  beforeLoad: ({ location }) => {
    const raw = location.search as Record<string, unknown>
    const defaults = defaultCalendarMonth()
    const tabRaw = typeof raw.tab === 'string' ? raw.tab : 'calendar'
    const tab = TABS.has(tabRaw as CareTab) ? (tabRaw as CareTab) : 'calendar'
    const year =
      typeof raw.year === 'number' && Number.isFinite(raw.year)
        ? raw.year
        : typeof raw.year === 'string' && Number.isFinite(Number(raw.year))
          ? Number(raw.year)
          : defaults.year
    const month =
      typeof raw.month === 'number' &&
      Number.isFinite(raw.month) &&
      raw.month >= 0 &&
      raw.month <= 11
        ? raw.month
        : typeof raw.month === 'string' &&
            Number.isFinite(Number(raw.month)) &&
            Number(raw.month) >= 0 &&
            Number(raw.month) <= 11
          ? Number(raw.month)
          : defaults.month
    const day =
      typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day)
        ? raw.day
        : defaults.day

    throw redirect({
      to: '/schedule',
      search: { tab, year, month, day },
      replace: true,
    })
  },
})
