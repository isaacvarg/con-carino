import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { AutomationsSettingsPanel } from '#/components/app/settings/AutomationsSettingsPanel'
import { listAccounts } from '#/server/accounts'
import { listAutomations } from '#/server/automations'
import { listAppUsers } from '#/server/care'
import { listCategories, listTags } from '#/server/taxonomies'

export const Route = createFileRoute('/_app/settings/automations')({
  // No auth guard: the parent settings route already redirects signed-out
  // visitors, and automations are not module-gated.
  loader: async () => {
    const [automations, accounts, tags, categories, users] = await Promise.all([
      listAutomations(),
      listAccounts(),
      listTags(),
      listCategories(),
      listAppUsers(),
    ])
    return { automations, accounts, tags, categories, users }
  },
  component: SettingsAutomationsPage,
})

function SettingsAutomationsPage() {
  const { automations, accounts, tags, categories, users } =
    Route.useLoaderData()
  const { session } = useRouteContext({ from: '/_app/settings' })

  return (
    <div className="flex flex-col gap-4">
      <AutomationsSettingsPanel
        automations={automations}
        accounts={accounts}
        tags={tags}
        categories={categories}
        users={users}
        currentUserId={session?.user?.id ?? null}
      />
    </div>
  )
}
