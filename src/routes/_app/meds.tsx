import { createFileRoute } from '@tanstack/react-router'
import ComingSoonFeedback from '#/components/app/ComingSoonFeedback'

export const Route = createFileRoute('/_app/meds')({
  component: MedsPage,
})

function MedsPage() {
  return (
    <ComingSoonFeedback
      title="Meds"
      description="Medication tracking will appear here."
    />
  )
}
