import { createFileRoute } from '@tanstack/react-router'
import ComingSoonFeedback from '#/components/app/ComingSoonFeedback'

export const Route = createFileRoute('/_app/insights')({
  component: InsightsPage,
})

function InsightsPage() {
  return (
    <ComingSoonFeedback
      title="Insights"
      description="Spending insights and analytics will appear here."
    />
  )
}
