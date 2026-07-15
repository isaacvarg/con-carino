import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/meds')({
  component: MedsPage,
})

function MedsPage() {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">Meds</h2>
        <p className="text-base-content/60">
          Medication tracking will appear here.
        </p>
      </div>
    </div>
  )
}
