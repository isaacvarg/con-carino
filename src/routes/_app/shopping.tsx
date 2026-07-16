import { createFileRoute } from '@tanstack/react-router'
import ComingSoonFeedback from '#/components/app/ComingSoonFeedback'

export const Route = createFileRoute('/_app/shopping')({
  component: ShoppingPage,
})

function ShoppingPage() {
  return (
    <ComingSoonFeedback
      title="Shopping"
      description="Shopping lists will appear here."
    />
  )
}
