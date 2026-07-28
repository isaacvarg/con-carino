import { createFileRoute, redirect } from '@tanstack/react-router'
import { CareContributionsDashboard } from '#/components/app/care/CareContributionsDashboard'
import { getContributionsOverview } from '#/server/care'

export const Route = createFileRoute('/_app/contributions')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  loader: async () => ({ overview: await getContributionsOverview() }),
  component: ContributionsPage,
})

function ContributionsPage() {
  const { overview } = Route.useLoaderData()
  return <CareContributionsDashboard overview={overview} />
}
