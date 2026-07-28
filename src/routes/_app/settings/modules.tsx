import { createFileRoute } from '@tanstack/react-router'
import { ModulesSettingsPanel } from '#/components/app/settings/ModulesSettingsPanel'
import { getModuleFlags } from '#/server/care-modules'

export const Route = createFileRoute('/_app/settings/modules')({
  loader: async () => ({ modules: await getModuleFlags() }),
  component: SettingsModulesPage,
})

function SettingsModulesPage() {
  const { modules } = Route.useLoaderData()

  return <ModulesSettingsPanel modules={modules} />
}
