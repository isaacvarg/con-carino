import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">Settings</h2>
        <p className="text-base-content/60">
          Profile and application preferences will appear here.
        </p>
      </div>
    </div>
  )
}
