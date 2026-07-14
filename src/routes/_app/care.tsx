import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/care')({
  component: CarePage,
})

function CarePage() {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">Care</h2>
        <p className="text-base-content/60">
          Support and care resources will appear here.
        </p>
      </div>
    </div>
  )
}
