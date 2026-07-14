import { createFileRoute } from '@tanstack/react-router'
import { AddAccountForm } from '#/components/app/accounts/AddAccountForm'
import { listAccountGroups } from '#/server/accounts'

export const Route = createFileRoute('/_app/accounts/new')({
  loader: () => listAccountGroups(),
  component: NewAccountRoute,
})

function NewAccountRoute() {
  const groups = Route.useLoaderData()
  return <AddAccountForm groups={groups} />
}
