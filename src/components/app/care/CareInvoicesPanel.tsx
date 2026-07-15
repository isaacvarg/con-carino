import { Link, useRouter } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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

function periodLabel(invoice: CareInvoiceDto): string {
  if (invoice.periodStart && invoice.periodEnd) {
    return formatTimeRange(invoice.periodStart, invoice.periodEnd)
  }
  if (invoice.lines.length === 1) {
    return formatTimeRange(invoice.lines[0]!.startsAt, invoice.lines[0]!.endsAt)
  }
  if (invoice.lines.length > 1) {
    return `${invoice.lines.length} shifts`
  }
  return '—'
}

function InvoiceLines({ invoice }: { invoice: CareInvoiceDto }) {
  if (invoice.lines.length === 0) {
    return (
      <p className="mt-2 text-xs text-base-content/50">No coverage lines.</p>
    )
  }
  return (
    <ul className="mt-3 space-y-1.5 border-t border-base-300 pt-3">
      {invoice.lines.map((line) => (
        <li
          key={line.id}
          className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
        >
          <span className="text-base-content/70">
            {formatTimeRange(line.startsAt, line.endsAt)}
          </span>
          <span className="tabular-nums text-base-content/60">
            {Number(line.hoursSnapshot).toFixed(2)} hrs × $
            {Number(line.hourlyRateSnapshot).toFixed(2)} = $
            {Number(line.amount).toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function CareInvoicesPanel({
  invoices,
  accounts,
  highlightInvoiceId,
}: CareInvoicesPanelProps) {
  const router = useRouter()
  const settleDialogRef = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [settleId, setSettleId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])
  const settleBusy = Boolean(settleId && busyId === settleId)

  useEffect(() => {
    if (!highlightInvoiceId) return
    const el = document.getElementById(`invoice-${highlightInvoiceId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setExpandedIds((prev) => new Set(prev).add(highlightInvoiceId))
  }, [highlightInvoiceId, invoices])

  const open = useMemo(
    () => invoices.filter((i) => i.status === 'OPEN'),
    [invoices],
  )
  const closed = useMemo(
    () => invoices.filter((i) => i.status !== 'OPEN'),
    [invoices],
  )

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
        id: 'period',
        accessorFn: (row) => row.periodEnd ?? row.createdAt,
        header: 'Period',
        cell: ({ row }) => (
          <span className="text-base-content/70">
            {periodLabel(row.original)}
          </span>
        ),
        sortingFn: (rowA, rowB) => {
          const a = new Date(
            rowA.original.periodEnd ?? rowA.original.createdAt,
          ).getTime()
          const b = new Date(
            rowB.original.periodEnd ?? rowB.original.createdAt,
          ).getTime()
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
      {
        id: 'createdAt',
        accessorFn: (row) => row.createdAt,
        header: 'Created',
        cell: ({ getValue }) => (
          <span className="text-base-content/60">
            {new Date(String(getValue())).toLocaleDateString()}
          </span>
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

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openSettle(invoiceId: string) {
    setError(null)
    setSettleId(invoiceId)
    setAccountId(accounts[0]?.id ?? '')
    const dialog = settleDialogRef.current
    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }

  function closeSettle() {
    if (settleBusy) return
    settleDialogRef.current?.close()
  }

  function handleSettleDialogClose() {
    setSettleId(null)
  }

  async function settle() {
    if (!settleId || !accountId) return
    setBusyId(settleId)
    setError(null)
    try {
      await settleCareInvoice({
        data: { id: settleId, financialAccountId: accountId },
      })
      settleDialogRef.current?.close()
      setSettleId(null)
      void router.invalidate()
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
      void router.invalidate()
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
          Created on each paid person&apos;s pay schedule from accrued coverage.
          Settle into a household account as an expense.
        </p>
        {open.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">No open invoices.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((inv) => {
              const expanded = expandedIds.has(inv.id)
              return (
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
                        {periodLabel(inv)}
                        {inv.lines.length > 1
                          ? ` · ${inv.lines.length} shifts`
                          : ''}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                        onClick={() => toggleExpanded(inv.id)}
                      >
                        {expanded ? 'Hide coverage' : 'Show coverage'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyId === inv.id || accounts.length === 0}
                        onClick={() => openSettle(inv.id)}
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
                  {expanded ? <InvoiceLines invoice={inv} /> : null}
                </li>
              )
            })}
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
                  const expanded = expandedIds.has(row.original.id)
                  return (
                    <Fragment key={row.id}>
                      <tr
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
                      <tr>
                        <td colSpan={columns.length} className="!py-0">
                          <button
                            type="button"
                            className="mb-2 text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() => toggleExpanded(row.original.id)}
                          >
                            {expanded ? 'Hide coverage' : 'Show coverage'}
                          </button>
                          {expanded ? (
                            <div className="pb-3">
                              <InvoiceLines invoice={row.original} />
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <dialog
        ref={settleDialogRef}
        className="modal"
        onClose={handleSettleDialogClose}
        onCancel={(e) => {
          if (settleBusy) e.preventDefault()
        }}
      >
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
                disabled={settleBusy}
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
                onClick={closeSettle}
                disabled={settleBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={settleBusy || !accountId}
                onClick={settle}
              >
                {settleBusy ? 'Settling…' : 'Confirm payment'}
              </button>
            </FormActions>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" disabled={settleBusy}>
            close
          </button>
        </form>
      </dialog>
    </div>
  )
}
