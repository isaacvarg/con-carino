import { Link, useNavigate } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { HiPlus, HiSwitchHorizontal } from 'react-icons/hi'
import type { TransactionListItem } from '#/server/transactions'
import {
  formatAccountCurrency,
  formatTransactionDate,
  transactionTypeLabel,
} from './account-utils'
import { AccountSpeedDial } from './AccountSpeedDial'
import type { AccountTransactionsSearch } from './account-detail-search'

export type TransactionsTableSearch = AccountTransactionsSearch

type TransactionsTableProps = {
  accountId: string
  openingBalance: string
  currentBalance: string
  transactions: TransactionListItem[]
  search: TransactionsTableSearch
}

const COLUMN_IDS = [
  'select',
  'date',
  'type',
  'payee',
  'category',
  'tags',
  'description',
  'amount',
] as const

function parseSort(sort: string): SortingState {
  if (!sort) return [{ id: 'date', desc: true }]
  const desc = sort.startsWith('-')
  const id = desc ? sort.slice(1) : sort
  if (!COLUMN_IDS.includes(id as (typeof COLUMN_IDS)[number]) || id === 'select') {
    return [{ id: 'date', desc: true }]
  }
  return [{ id, desc }]
}

function serializeSort(sorting: SortingState): string {
  const first = sorting[0]
  if (!first) return '-date'
  return first.desc ? `-${first.id}` : first.id
}

function parseCols(cols: string): VisibilityState {
  if (!cols) return {}
  const hidden = new Set(cols.split(',').filter(Boolean))
  const visibility: VisibilityState = {}
  for (const id of COLUMN_IDS) {
    if (id === 'select') continue
    if (hidden.has(id)) visibility[id] = false
  }
  return visibility
}

function serializeCols(visibility: VisibilityState): string {
  return COLUMN_IDS.filter(
    (id) => id !== 'select' && visibility[id] === false,
  ).join(',')
}

export function TransactionsTable({
  accountId,
  openingBalance,
  currentBalance,
  transactions,
  search,
}: TransactionsTableProps) {
  const navigate = useNavigate({ from: '/accounts/$accountId/' })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const sorting = useMemo(() => parseSort(search.sort), [search.sort])
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: Math.max(0, search.page - 1),
      pageSize: search.pageSize,
    }),
    [search.page, search.pageSize],
  )
  const globalFilter = search.q
  const columnVisibility = useMemo(() => parseCols(search.cols), [search.cols])
  const columnFilters = useMemo<ColumnFiltersState>(() => [], [])

  function updateSearch(
    patch: Partial<TransactionsTableSearch>,
    source: string,
  ) {
    const next = { ...search, ...patch }
    const unchanged =
      next.page === search.page &&
      next.pageSize === search.pageSize &&
      next.sort === search.sort &&
      next.q === search.q &&
      next.cols === search.cols

    // #region agent log
    fetch('http://127.0.0.1:7370/ingest/1b862042-6039-4f52-970e-ddff822b37a8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'd29c5e',
      },
      body: JSON.stringify({
        sessionId: 'd29c5e',
        runId: 'post-fix',
        hypothesisId: 'H6',
        location: 'TransactionsTable.tsx:updateSearch',
        message: unchanged
          ? 'updateSearch skipped (unchanged)'
          : 'updateSearch navigating',
        data: { source, unchanged, patch, search },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    if (unchanged) return

    void navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
      }),
      replace: true,
    })
  }

  const columns = useMemo<ColumnDef<TransactionListItem>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={table.getIsAllPageRowsSelected()}
            ref={(element) => {
              if (element) {
                element.indeterminate = table.getIsSomePageRowsSelected()
              }
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all rows on this page"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select transaction ${row.original.id}`}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ getValue }) => formatTransactionDate(String(getValue())),
        sortingFn: (rowA, rowB, columnId) => {
          const a = new Date(String(rowA.getValue(columnId))).getTime()
          const b = new Date(String(rowB.getValue(columnId))).getTime()
          return a === b ? 0 : a > b ? 1 : -1
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ getValue }) =>
          transactionTypeLabel(
            getValue() as TransactionListItem['type'],
          ),
        filterFn: 'includesString',
      },
      {
        id: 'payee',
        accessorFn: (row) => row.payee?.name ?? '',
        header: 'Payee',
        cell: ({ getValue }) => {
          const value = String(getValue())
          return value.trim() ? value : '—'
        },
        filterFn: 'includesString',
      },
      {
        id: 'category',
        accessorFn: (row) => row.category?.name ?? '',
        header: 'Category',
        cell: ({ getValue }) => {
          const value = String(getValue())
          return value.trim() ? value : '—'
        },
        filterFn: 'includesString',
      },
      {
        id: 'tags',
        accessorFn: (row) =>
          row.tags.map((tag) => tag.name).join(', '),
        header: 'Tags',
        cell: ({ getValue }) => {
          const value = String(getValue())
          return value.trim() ? value : '—'
        },
        filterFn: 'includesString',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ getValue }) => {
          const value = getValue() as string | null
          return value?.trim() ? value : '—'
        },
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => {
          const raw = String(getValue())
          const numeric = Number(raw)
          const tone =
            numeric < 0
              ? 'text-error'
              : numeric > 0
                ? 'text-success'
                : 'text-base-content'
          return (
            <span className={`tabular-nums ${tone}`}>
              {formatAccountCurrency(raw)}
            </span>
          )
        },
        sortingFn: (rowA, rowB, columnId) => {
          const a = Number(rowA.getValue(columnId))
          const b = Number(rowB.getValue(columnId))
          return a === b ? 0 : a > b ? 1 : -1
        },
      },
    ],
    [],
  )

  const table = useReactTable({
    data: transactions,
    columns,
    state: {
      sorting,
      pagination,
      globalFilter,
      columnVisibility,
      columnFilters,
      rowSelection,
    },
    enableRowSelection: true,
    // Pagination is URL-controlled; disabling auto-reset prevents no-op
    // onPaginationChange → navigate(replace) loops when `data` gets a new ref.
    autoResetPageIndex: false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      updateSearch({ sort: serializeSort(next), page: 1 }, 'sorting')
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(pagination) : updater
      updateSearch(
        {
          page: next.pageIndex + 1,
          pageSize: next.pageSize,
        },
        'pagination',
      )
    },
    onGlobalFilterChange: (value) => {
      updateSearch({ q: String(value ?? ''), page: 1 }, 'filter')
    },
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(columnVisibility) : updater
      updateSearch({ cols: serializeCols(next) }, 'columns')
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    getRowId: (row) => row.id,
  })

  const pageCount = table.getPageCount()

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-box bg-base-100 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-base-content/50">
            Opening balance
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-base-content">
            {formatAccountCurrency(openingBalance)}
          </p>
        </div>
        <div className="rounded-box bg-base-100 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-base-content/50">
            Current balance
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-base-content">
            {formatAccountCurrency(currentBalance)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-base-content">
            Transactions
          </h3>
          <p className="text-sm text-base-content/60">
            {transactions.length} total · sorted and filtered in the URL
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/accounts/$accountId/transfers/new"
            params={{ accountId }}
            className="btn btn-outline gap-2"
          >
            <HiSwitchHorizontal className="size-4" aria-hidden />
            Transfer
          </Link>
          <Link
            to="/accounts/$accountId/transactions/new"
            params={{ accountId }}
            className="btn btn-primary gap-2"
          >
            <HiPlus className="size-4" aria-hidden />
            Add transaction
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-box bg-base-100 p-4 shadow-sm">
        <label className="form-control min-w-56 flex-1">
          <span className="label-text mb-1 text-sm">Filter</span>
          <input
            type="search"
            className="input input-bordered w-full"
            value={globalFilter}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            placeholder="Search description, type…"
          />
        </label>

        <div className="dropdown dropdown-end">
          <button type="button" tabIndex={0} className="btn btn-outline">
            Columns
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content menu z-20 mt-2 w-52 rounded-box border border-base-200 bg-base-100 p-2 shadow"
          >
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <li key={column.id}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    <span className="capitalize">{column.id}</span>
                  </label>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
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
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="py-10 text-center text-base-content/60"
                >
                  No transactions yet. Add one to get started.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.getIsSelected()}
                  className="cursor-pointer hover:bg-base-200/70"
                  onClick={() => {
                    void navigate({
                      to: '/transactions/$transactionId',
                      params: { transactionId: row.original.id },
                    })
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      onClick={
                        cell.column.id === 'select'
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-base-content">
          <span className="font-medium text-base-content">
            Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-base-content">Rows</span>
            <select
              className="select select-bordered select-sm w-20 border-base-300 bg-base-100 text-base-content"
              value={pagination.pageSize}
              aria-label="Rows per page"
              onChange={(event) => {
                table.setPageSize(Number(event.target.value))
              }}
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          {Object.keys(rowSelection).length > 0 ? (
            <span className="text-base-content/70">
              {Object.keys(rowSelection).length} selected
            </span>
          ) : null}
        </div>
        <div className="join rounded-full border border-base-300 bg-base-100">
          <button
            type="button"
            className="btn btn-ghost btn-sm join-item text-base-content disabled:bg-transparent disabled:text-base-content/40"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm join-item text-base-content disabled:bg-transparent disabled:text-base-content/40"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
      </div>

      <AccountSpeedDial accountId={accountId} />
    </div>
  )
}
