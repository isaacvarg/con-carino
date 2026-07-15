import { createFileRoute, redirect } from '@tanstack/react-router'
import { CareInvoicesPanel } from '#/components/app/care/CareInvoicesPanel'
import { listAccounts } from '#/server/accounts'
import { listCareInvoices } from '#/server/care'

type InvoicesSearch = {
  invoiceId?: string
}

function validateInvoicesSearch(search: Record<string, unknown>): InvoicesSearch {
  const invoiceId =
    typeof search.invoiceId === 'string' && search.invoiceId
      ? search.invoiceId
      : undefined
  return invoiceId ? { invoiceId } : {}
}

export const Route = createFileRoute('/_app/invoices')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  validateSearch: validateInvoicesSearch,
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
  const { invoiceId } = Route.useSearch()

  return (
    <div className="flex flex-col gap-4">
      <CareInvoicesPanel
        invoices={invoices}
        accounts={accounts}
        highlightInvoiceId={invoiceId}
      />
    </div>
  )
}
