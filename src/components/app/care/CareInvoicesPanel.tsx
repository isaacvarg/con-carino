import { Link, useRouter } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import {
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
} from '#/components/app/ui/form'
import type { AccountListItem } from '#/server/accounts'
import type { CareInvoiceDto } from '#/server/care'
import { settleCareInvoice, voidCareInvoice } from '#/server/care'
import { formatTimeRange } from './care-utils'

type CareInvoicesPanelProps = {
  invoices: CareInvoiceDto[]
  accounts: AccountListItem[]
  highlightInvoiceId?: string
}

function settledTransactionLink(invoice: CareInvoiceDto) {
  if (!invoice.settledTransactionId) {
    return null
  }
  return {
    to: '/transactions/$transactionId' as const,
    params: { transactionId: invoice.settledTransactionId },
  }
}

export function CareInvoicesPanel({
  invoices,
  accounts,
  highlightInvoiceId,
}: CareInvoicesPanelProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [settleId, setSettleId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'endsAt', desc: true },
  ])

  useEffect(() => {
    if (!highlightInvoiceId) return
    const el = document.getElementById(`invoice-${highlightInvoiceId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightInvoiceId, invoices])

  const open = invoices.filter((i) => i.status === 'OPEN')
  const closed = invoices.filter((i) => i.status !== 'OPEN')

  const columns = useMemo<ColumnDef<CareInvoiceDto>[]>(
    () => [
      {
        accessorKey: 'carePersonName',
        header: 'Person',
        cell: ({ getValue }) => (
          <span className="font-medium">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            ${Number(getValue()).toFixed(2)}
          </span>
        ),
        sortingFn: (rowA, rowB, columnId) => {
          const a = Number(rowA.getValue(columnId))
          const b = Number(rowB.getValue(columnId))
          return a === b ? 0 : a > b ? 1 : -1
        },
      },
      {
        id: 'endsAt',
        accessorFn: (row) => row.endsAt,
        header: 'Coverage',
        cell: ({ row }) => (
          <span className="text-base-content/70">
            {formatTimeRange(row.original.startsAt, row.original.endsAt)}
          </span>
        ),
        sortingFn: (rowA, rowB) => {
          const a = new Date(rowA.original.endsAt).getTime()
          const b = new Date(rowB.original.endsAt).getTime()
          return a === b ? 0 : a > b ? 1 : -1
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => (
          <span className="badge badge-outline">{String(getValue())}</span>
        ),
      },
    ],
    [],
  )

  const closedTable = useReactTable({
    data: closed,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  })

  async function settle() {
    if (!settleId || !accountId) return
    setBusyId(settleId)
    setError(null)
    try {
      await settleCareInvoice({
        data: { id: settleId, financialAccountId: accountId },
      })
      setSettleId(null)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not settle.')
    } finally {
      setBusyId(null)
    }
  }

  async function voidInvoice(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await voidCareInvoice({ data: { id } })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-box bg-base-100 p-4 shadow-sm">
        <h3 className="font-semibold">Open invoices</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Created after paid coverage shifts end. Settle into a household
          account as an expense.
        </p>
        {open.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">No open invoices.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((inv) => (
              <li
                key={inv.id}
                id={`invoice-${inv.id}`}
                className={
                  highlightInvoiceId === inv.id
                    ? 'rounded-lg border border-primary bg-primary/5 p-4'
                    : 'rounded-lg border border-base-300 p-4'
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {inv.carePersonName} · $
                      {Number(inv.amount).toFixed(2)}
                    </p>
                    <p className="text-sm text-base-content/60">
                      {formatTimeRange(inv.startsAt, inv.endsAt)}
                    </p>
                    <p className="text-xs text-base-content/50">
                      {Number(inv.hoursSnapshot).toFixed(2)} hrs × $
                      {Number(inv.hourlyRateSnapshot).toFixed(2)}/hr
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === inv.id || accounts.length === 0}
                      onClick={() => {
                        setSettleId(inv.id)
                        setAccountId(accounts[0]?.id ?? '')
                      }}
                    >
                      Settle
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === inv.id}
                      onClick={() => voidInvoice(inv.id)}
                    >
                      Void
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {accounts.length === 0 ? (
          <p className="mt-3 text-sm text-warning">
            Add a financial account before settling invoices.
          </p>
        ) : null}
      </section>

      <section className="rounded-box bg-base-100 p-4 shadow-sm">
        <h3 className="font-semibold">Paid & voided</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Paid rows open the settlement transaction on the account.
        </p>
        {closed.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">None yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead>
                {closedTable.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} scope="col">
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {{
                              asc: ' ↑',
                              desc: ' ↓',
                            }[header.column.getIsSorted() as string] ?? null}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {closedTable.getRowModel().rows.map((row) => {
                  const link = settledTransactionLink(row.original)
                  const highlighted = highlightInvoiceId === row.original.id
                  return (
                    <tr
                      key={row.id}
                      id={`invoice-${row.original.id}`}
                      className={
                        highlighted
                          ? 'bg-primary/5'
                          : link
                            ? 'hover:bg-base-200/70'
                            : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={link ? '!p-0' : undefined}>
                          {link ? (
                            <Link
                              to={link.to}
                              params={link.params}
                              className="block h-full w-full cursor-pointer px-4 py-3 text-inherit no-underline"
                              aria-label={`Open settlement transaction for ${row.original.carePersonName}`}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </Link>
                          ) : (
                            flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {settleId ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-semibold">Settle invoice</h3>
            <p className="mt-2 text-sm text-base-content/70">
              Creates an expense on the selected account.
            </p>
            <div className="app-form mt-4">
              <FormField label="Account" htmlFor="settle-account">
                <select
                  id="settle-account"
                  className={FORM_SELECT_CLASS}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currentBalance})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormActions>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSettleId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === settleId}
                  onClick={settle}
                >
                  {busyId === settleId ? 'Settling…' : 'Confirm payment'}
                </button>
              </FormActions>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setSettleId(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  )
}
