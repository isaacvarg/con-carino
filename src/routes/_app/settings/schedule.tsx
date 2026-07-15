import { createFileRoute } from '@tanstack/react-router'
import { CareEventTypesPanel } from '#/components/app/care/CareEventTypesPanel'
import { listCareEventTypes } from '#/server/care'

export const Route = createFileRoute('/_app/settings/schedule')({
  loader: async () => {
    const eventTypes = await listCareEventTypes()
    return { eventTypes }
  },
  component: SettingsSchedulePage,
})

function SettingsSchedulePage() {
  const { eventTypes } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <CareEventTypesPanel eventTypes={eventTypes} />
    </div>
  )
}
