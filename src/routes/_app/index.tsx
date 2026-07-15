import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardPage from '#/components/app/dashboard/DashboardPage'
import { listRecentActivity } from '#/server/activity'

export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  loader: async () => {
    const recentActivity = await listRecentActivity({ data: { take: 8 } })
    return { recentActivity }
  },
  component: DashboardRoute,
})

function DashboardRoute() {
  const { recentActivity } = Route.useLoaderData()
  return <DashboardPage recentActivity={recentActivity} />
}
