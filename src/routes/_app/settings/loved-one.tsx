import { Link, createFileRoute } from '@tanstack/react-router'
import { HiArrowLeft } from 'react-icons/hi'
import { LovedOneSettingsPanel } from '#/components/app/settings/LovedOneSettingsPanel'
import { getCareSettings } from '#/server/care'

export const Route = createFileRoute('/_app/settings/loved-one')({
  loader: async () => {
    const settings = await getCareSettings()
    return { settings }
  },
  component: SettingsLovedOnePage,
})

function SettingsLovedOnePage() {
  const { settings } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Loved one</h2>
          <p className="mt-1 text-sm text-base-content/60">
            Configure who is receiving care and what coverage is required.
          </p>
        </div>
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <HiArrowLeft className="size-4" aria-hidden />
          Settings
        </Link>
      </div>
      <LovedOneSettingsPanel settings={settings} />
    </div>
  )
}
