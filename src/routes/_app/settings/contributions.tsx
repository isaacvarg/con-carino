import { createFileRoute, redirect } from '@tanstack/react-router'
import { CareContributionsPanel } from '#/components/app/care/CareContributionsPanel'
import { listAccounts } from '#/server/accounts'
import {
  getCareSettings,
  listCarePeople,
  listContributionProfiles,
} from '#/server/care'

export const Route = createFileRoute('/_app/settings/contributions')({
  beforeLoad: ({ context }) => {
    if (!context.modules.contributionsEnabled) {
      throw redirect({ to: '/settings' })
    }
  },
  loader: async () => {
    const [settings, people, profiles, accounts] = await Promise.all([
      getCareSettings(),
      listCarePeople(),
      listContributionProfiles(),
      listAccounts(),
    ])
    return { settings, people, profiles, accounts }
  },
  component: SettingsContributionsPage,
})

function SettingsContributionsPage() {
  const { settings, people, profiles, accounts } = Route.useLoaderData()

  return (
    <CareContributionsPanel
      settings={settings}
      people={people}
      profiles={profiles}
      accounts={accounts}
    />
  )
}
