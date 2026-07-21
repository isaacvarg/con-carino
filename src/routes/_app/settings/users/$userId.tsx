import { createFileRoute } from '@tanstack/react-router'
import { UserDetailPanel } from '#/components/app/settings/UserDetailPanel'
import { listCarePersonTypes } from '#/server/care'
import { getUser, listUserActivity } from '#/server/users'

export const Route = createFileRoute('/_app/settings/users/$userId')({
  loader: async ({ params }) => {
    const [user, types, activity] = await Promise.all([
      getUser({ data: { userId: params.userId } }),
      listCarePersonTypes(),
      listUserActivity({ data: { userId: params.userId, take: 50 } }),
    ])
    return { user, types, activity }
  },
  component: SettingsUserDetailPage,
})

function SettingsUserDetailPage() {
  const { user, types, activity } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-base-content">
          {user.name?.trim() || user.email || 'User'}
        </h1>
        <p className="mt-1 text-sm text-base-content/60">
          Profile, care person settings, sessions, and activity.
        </p>
      </div>
      <UserDetailPanel user={user} types={types} activity={activity} />
    </div>
  )
}
