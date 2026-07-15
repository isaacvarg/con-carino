import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { ActivityDetailView } from '#/components/app/activity/ActivityViews'
import { getActivity } from '#/server/activity'

export const Route = createFileRoute('/_app/activity/$activityId')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  loader: async ({ params }) => {
    try {
      const activity = await getActivity({
        data: { id: params.activityId },
      })
      return { activity }
    } catch {
      throw notFound()
    }
  },
  component: ActivityDetailPage,
})

function ActivityDetailPage() {
  const { activity } = Route.useLoaderData()
  return <ActivityDetailView activity={activity} />
}
