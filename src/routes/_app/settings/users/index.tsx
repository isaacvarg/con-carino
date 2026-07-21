import { createFileRoute } from '@tanstack/react-router'
import { UsersTable } from '#/components/app/settings/UsersTable'
import { listUsers } from '#/server/users'

export const Route = createFileRoute('/_app/settings/users/')({
  loader: async () => listUsers(),
  component: SettingsUsersPage,
})

function SettingsUsersPage() {
  const users = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-base-content">Users</h1>
        <p className="mt-1 text-sm text-base-content/60">
          App accounts, admin access, and linked care people.
        </p>
      </div>
      <div className="app-card p-4 sm:p-6">
        <UsersTable users={users} />
      </div>
    </div>
  )
}
