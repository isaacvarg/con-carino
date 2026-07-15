import { createFileRoute } from '@tanstack/react-router'
import { LovedOneSettingsPanel } from '#/components/app/settings/LovedOneSettingsPanel'
import { getCareSettings } from '#/server/care'

export const Route = createFileRoute('/_app/settings/loved-one')({
  loader: async () => {
    const settings = await getCareSettings()
    return { settings }
  },
  component: SettingsLovedOnePage,
})

function SettingsLovedOnePage() {
  const { settings } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <LovedOneSettingsPanel settings={settings} />
    </div>
  )
}
