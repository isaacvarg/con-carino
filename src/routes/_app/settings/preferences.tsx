import { createFileRoute } from '@tanstack/react-router'
import { PreferencesSettingsPanel } from '#/components/app/settings/PreferencesSettingsPanel'
import { getWeekStart } from '#/server/week-start'

export const Route = createFileRoute('/_app/settings/preferences')({
  loader: async () => ({ weekStartsOn: await getWeekStart() }),
  component: SettingsPreferencesPage,
})

function SettingsPreferencesPage() {
  const { weekStartsOn } = Route.useLoaderData()

  return <PreferencesSettingsPanel weekStartsOn={weekStartsOn} />
}
