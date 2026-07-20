import { CareCalendarPanel, defaultCalendarMonth } from './CareCalendarPanel'
import { CareSwapsPanel } from './CareSwapsPanel'
import type {
  CareCalendarEventDto,
  CareCoverageOccurrenceDto,
  CareEventTypeDto,
  CarePersonDto,
  CareSettingsDto,
  CareSwapRequestDto,
} from '#/server/care'

export type CareTab = 'calendar' | 'swaps'

export type CarePageData = {
  settings: CareSettingsDto
  people: CarePersonDto[]
  occurrences: CareCoverageOccurrenceDto[]
  events: CareCalendarEventDto[]
  eventTypes: CareEventTypeDto[]
  swaps: CareSwapRequestDto[]
  pendingSwapCount: number
  year: number
  month: number
  selectedDay: string
}

type CarePageProps = {
  data: CarePageData
  tab: CareTab
  onTabChange: (tab: CareTab) => void
  onMonthChange: (year: number, month: number) => void
  onSelectDay: (day: string) => void
}

const TABS: Array<{ id: CareTab; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'swaps', label: 'Swaps' },
]

export function CarePage({
  data,
  tab,
  onTabChange,
  onMonthChange,
  onSelectDay,
}: CarePageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="tabs tabs-box w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
            {t.id === 'swaps' && data.pendingSwapCount > 0 ? (
              <span className="badge badge-primary badge-sm ml-1">
                {data.pendingSwapCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <CareCalendarPanel
          lovedOneName={data.settings.lovedOneName}
          settings={data.settings}
          year={data.year}
          month={data.month}
          selectedDay={data.selectedDay}
          occurrences={data.occurrences}
          events={data.events}
          eventTypes={data.eventTypes}
          people={data.people}
          onMonthChange={onMonthChange}
          onSelectDay={onSelectDay}
        />
      ) : null}
      {tab === 'swaps' ? <CareSwapsPanel swaps={data.swaps} /> : null}
    </div>
  )
}

export { defaultCalendarMonth }
