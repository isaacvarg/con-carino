import { createFileRoute } from '@tanstack/react-router'
import { PayeesSettingsPanel } from '#/components/app/settings/PayeesSettingsPanel'
import { listPayees } from '#/server/taxonomies'

export const Route = createFileRoute('/_app/settings/payees')({
  loader: async () => {
    const payees = await listPayees()
    return { payees }
  },
  component: SettingsPayeesPage,
})

function SettingsPayeesPage() {
  const { payees } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <PayeesSettingsPanel payees={payees} />
    </div>
  )
}
