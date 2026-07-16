import { createFileRoute } from '@tanstack/react-router'
import ComingSoonFeedback from '#/components/app/ComingSoonFeedback'

export const Route = createFileRoute('/_app/meals')({
  component: MealsPage,
})

function MealsPage() {
  return (
    <ComingSoonFeedback
      title="Meals"
      description="Meal planning and tracking will appear here."
    />
  )
}
