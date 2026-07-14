import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/documents')({
  component: DocumentsPage,
})

function DocumentsPage() {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">Documents</h2>
        <p className="text-base-content/60">
          Statements and uploaded documents will live here.
        </p>
      </div>
    </div>
  )
}
