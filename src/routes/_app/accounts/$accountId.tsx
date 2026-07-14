import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { AccountDetailHeader } from '#/components/app/accounts/AccountDetailHeader'
import { getAccount } from '#/server/accounts'

export const Route = createFileRoute('/_app/accounts/$accountId')({
  loader: async ({ params }) => {
    try {
      return await getAccount({ data: { id: params.accountId } })
    } catch {
      throw notFound()
    }
  },
  component: AccountIdLayout,
})

function AccountIdLayout() {
  const account = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <AccountDetailHeader account={account} />
      <Outlet />
    </div>
  )
}
