import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArchivedSettingsPanel } from '#/components/app/settings/ArchivedSettingsPanel'
import { listArchived } from '#/server/archived'

export const Route = createFileRoute('/_app/settings/archived')({
  beforeLoad: ({ context }) => {
    if (!context.session?.user?.isAdmin) {
      throw redirect({ to: '/settings' })
    }
  },
  loader: async () => {
    const items = await listArchived()
    return { items }
  },
  component: SettingsArchivedPage,
})

function SettingsArchivedPage() {
  const { items } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <ArchivedSettingsPanel items={items} />
    </div>
  )
}
