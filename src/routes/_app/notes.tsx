import { createFileRoute } from '@tanstack/react-router'
import ComingSoonFeedback from '#/components/app/ComingSoonFeedback'

export const Route = createFileRoute('/_app/notes')({
  component: NotesPage,
})

function NotesPage() {
  return (
    <ComingSoonFeedback
      title="Notes"
      description="Care notes and shared reminders will appear here."
    />
  )
}
