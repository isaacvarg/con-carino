import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  CarePage,
  defaultCalendarMonth,
  type CareTab,
} from '#/components/app/care/CarePage'
import { toDateInputValue } from '#/components/app/care/care-utils'
import {
  getCareSettings,
  listCareCalendar,
  listCarePeople,
  listSwapRequests,
} from '#/server/care'

const TABS = new Set<CareTab>(['calendar', 'swaps'])

type CareSearch = {
  tab: CareTab
  year: number
  month: number
  day: string
}

function validateCareSearch(search: Record<string, unknown>): CareSearch {
  const defaults = defaultCalendarMonth()
  const tabRaw = typeof search.tab === 'string' ? search.tab : 'calendar'
  const tab = TABS.has(tabRaw as CareTab) ? (tabRaw as CareTab) : 'calendar'
  const year =
    typeof search.year === 'number' && Number.isFinite(search.year)
      ? search.year
      : typeof search.year === 'string' && Number.isFinite(Number(search.year))
        ? Number(search.year)
        : defaults.year
  const month =
    typeof search.month === 'number' &&
    Number.isFinite(search.month) &&
    search.month >= 0 &&
    search.month <= 11
      ? search.month
      : typeof search.month === 'string' &&
          Number.isFinite(Number(search.month)) &&
          Number(search.month) >= 0 &&
          Number(search.month) <= 11
        ? Number(search.month)
        : defaults.month
  const day =
    typeof search.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.day)
      ? search.day
      : defaults.day
  return { tab, year, month, day }
}

function monthRange(year: number, month: number) {
  const rangeStart = new Date(year, month, 1)
  const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
  }
}

export const Route = createFileRoute('/_app/care')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  validateSearch: validateCareSearch,
  loaderDeps: ({ search }) => ({
    year: search.year,
    month: search.month,
  }),
  loader: async ({ deps }) => {
    const range = monthRange(deps.year, deps.month)
    const [settings, people, calendar, swaps] = await Promise.all([
      getCareSettings(),
      listCarePeople(),
      listCareCalendar({ data: range }),
      listSwapRequests(),
    ])

    return {
      settings: calendar.settings.lovedOneName
        ? calendar.settings
        : settings,
      people,
      occurrences: calendar.occurrences,
      events: calendar.events,
      swaps,
      pendingSwapCount: calendar.pendingSwapCount,
      year: deps.year,
      month: deps.month,
    }
  },
  component: CareRoute,
})

function CareRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <CarePage
      data={{
        ...data,
        selectedDay: search.day,
      }}
      tab={search.tab}
      onTabChange={(tab) => {
        void navigate({
          search: (prev) => ({ ...prev, tab }),
        })
      }}
      onMonthChange={(year, month) => {
        const day = toDateInputValue(new Date(year, month, 1))
        void navigate({
          search: (prev) => ({ ...prev, year, month, day }),
        })
      }}
      onSelectDay={(day) => {
        void navigate({
          search: (prev) => ({ ...prev, day }),
        })
      }}
    />
  )
}
