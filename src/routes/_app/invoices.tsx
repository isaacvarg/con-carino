import { createFileRoute, redirect } from '@tanstack/react-router'
import { CareForecastPanel } from '#/components/app/care/CareForecastPanel'
import { CareInvoicesPanel } from '#/components/app/care/CareInvoicesPanel'
import { listAccounts } from '#/server/accounts'
import { getCareForecast, listCareInvoices } from '#/server/care'

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
    const [invoices, accounts, forecast] = await Promise.all([
      listCareInvoices(),
      listAccounts(),
      getCareForecast({ data: { days: 60 } }),
    ])
    return { invoices, accounts, forecast }
  },
  component: InvoicesPage,
})

function InvoicesPage() {
  const { invoices, accounts, forecast } = Route.useLoaderData()
  const { invoiceId } = Route.useSearch()

  return (
    <div className="flex flex-col gap-4">
      <CareForecastPanel forecast={forecast} />
      <CareInvoicesPanel
        invoices={invoices}
        accounts={accounts}
        highlightInvoiceId={invoiceId}
      />
    </div>
  )
}
