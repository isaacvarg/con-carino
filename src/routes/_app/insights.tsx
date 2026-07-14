import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/insights')({
  component: InsightsPage,
})

function InsightsPage() {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">Insights</h2>
        <p className="text-base-content/60">
          Spending insights and analytics will appear here.
        </p>
      </div>
    </div>
  )
}
