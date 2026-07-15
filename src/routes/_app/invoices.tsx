import { createFileRoute, redirect } from '@tanstack/react-router'
import { CareInvoicesPanel } from '#/components/app/care/CareInvoicesPanel'
import { listAccounts } from '#/server/accounts'
import { listCareInvoices } from '#/server/care'

export const Route = createFileRoute('/_app/invoices')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  loader: async () => {
    const [invoices, accounts] = await Promise.all([
      listCareInvoices(),
      listAccounts(),
    ])
    return { invoices, accounts }
  },
  component: InvoicesPage,
})

function InvoicesPage() {
  const { invoices, accounts } = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-4">
      <CareInvoicesPanel invoices={invoices} accounts={accounts} />
    </div>
  )
}
