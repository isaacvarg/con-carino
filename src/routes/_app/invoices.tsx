import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { CareForecastPanel } from '#/components/app/care/CareForecastPanel'
import { CareInvoicesPanel } from '#/components/app/care/CareInvoicesPanel'
import { CarePayOverviewPanel } from '#/components/app/care/CarePayOverviewPanel'
import type { PayOverviewMode } from '#/lib/care-pay-period'
import { listAccounts } from '#/server/accounts'
import {
  getCarePayOverview,
  getCareForecast,
  listCareInvoices,
} from '#/server/care'

type InvoicesSearch = {
  invoiceId?: string
  /** Simple mode only; ignored by the advanced view. */
  payMode?: PayOverviewMode
  payOffset?: number
}

function validateInvoicesSearch(search: Record<string, unknown>): InvoicesSearch {
  const out: InvoicesSearch = {}

  if (typeof search.invoiceId === 'string' && search.invoiceId) {
    out.invoiceId = search.invoiceId
  }
  if (search.payMode === 'MONTHLY' || search.payMode === 'WEEKLY') {
    out.payMode = search.payMode
  }
  const offset = Number(search.payOffset)
  // Omit the default so the common case keeps a clean URL.
  if (Number.isFinite(offset) && offset !== 0) {
    out.payOffset = Math.trunc(offset)
  }

  return out
}

export const Route = createFileRoute('/_app/invoices')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
    // Hiding the sidebar link does not make the URL unreachable.
    if (context.modules.invoicingMode === 'OFF') {
      throw redirect({ to: '/' })
    }
  },
  validateSearch: validateInvoicesSearch,
  loaderDeps: ({ search }) => ({
    payMode: search.payMode ?? 'WEEKLY',
    payOffset: search.payOffset ?? 0,
  }),
  loader: async ({ context, deps }) => {
    if (context.modules.invoicingMode === 'SIMPLE') {
      return {
        mode: 'SIMPLE' as const,
        overview: await getCarePayOverview({
          data: { mode: deps.payMode, offset: deps.payOffset },
        }),
      }
    }

    const [invoices, accounts, forecast] = await Promise.all([
      listCareInvoices(),
      listAccounts(),
      getCareForecast({ data: { days: 60 } }),
    ])
    return { mode: 'ADVANCED' as const, invoices, accounts, forecast }
  },
  component: InvoicesPage,
})

function InvoicesPage() {
  const data = Route.useLoaderData()
  const { invoiceId } = Route.useSearch()
  const navigate = useNavigate({ from: '/invoices' })

  if (data.mode === 'SIMPLE') {
    return (
      <CarePayOverviewPanel
        overview={data.overview}
        // The period lives in the URL so a reload, a back button, or a shared
        // link all land on the same figures.
        onModeChange={(payMode) =>
          navigate({ search: { payMode }, replace: true })
        }
        onOffsetChange={(payOffset) =>
          navigate({
            search: (prev) => ({ ...prev, payOffset }),
            replace: true,
          })
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <CareForecastPanel forecast={data.forecast} />
      <CareInvoicesPanel
        invoices={data.invoices}
        accounts={data.accounts}
        highlightInvoiceId={invoiceId}
      />
    </div>
  )
}
