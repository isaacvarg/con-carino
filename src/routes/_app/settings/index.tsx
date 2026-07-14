import { createFileRoute } from '@tanstack/react-router'
import { SettingsHub } from '#/components/app/settings/SettingsHub'

export const Route = createFileRoute('/_app/settings/')({
  component: SettingsIndexPage,
})

function SettingsIndexPage() {
  return <SettingsHub />
}
