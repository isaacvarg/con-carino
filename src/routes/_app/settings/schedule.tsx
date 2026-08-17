import { createFileRoute } from '@tanstack/react-router'
import { CalendarHireDisplayPanel } from '#/components/app/care/CalendarHireDisplayPanel'
import { CareEventTypesPanel } from '#/components/app/care/CareEventTypesPanel'
import { getCareSettings, listCareEventTypes } from '#/server/care'

export const Route = createFileRoute('/_app/settings/schedule')({
  loader: async () => {
    const [eventTypes, settings] = await Promise.all([
      listCareEventTypes(),
      getCareSettings(),
    ])
    return { eventTypes, settings }
  },
  component: SettingsSchedulePage,
})

function SettingsSchedulePage() {
  const { eventTypes, settings } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <CalendarHireDisplayPanel settings={settings} />
      <CareEventTypesPanel eventTypes={eventTypes} />
    </div>
  )
}
