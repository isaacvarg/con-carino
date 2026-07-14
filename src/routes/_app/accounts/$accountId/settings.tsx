import { createFileRoute, redirect } from '@tanstack/react-router'
import { AccountSettingsForm } from '#/components/app/accounts/AccountSettingsForm'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import { getAccount } from '#/server/accounts'

export const Route = createFileRoute('/_app/accounts/$accountId/settings')({
  loader: async ({ params }) => {
    const account = await getAccount({ data: { id: params.accountId } })
    if (!account.isOwned) {
      throw redirect({
        to: '/accounts/$accountId',
        params: { accountId: params.accountId },
        search: accountDetailSearchDefaults,
      })
    }
    return account
  },
  component: AccountSettingsPage,
})

function AccountSettingsPage() {
  const account = Route.useLoaderData()
  return <AccountSettingsForm account={account} />
}
