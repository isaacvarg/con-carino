import { Link, useNavigate } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import { HiOutlineSearch, HiPlus } from 'react-icons/hi'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import {
  formatAccountCurrency,
  formatTransactionDate,
  transactionTypeLabel,
} from '#/components/app/accounts/account-utils'
import type { VisibleTransactionListItem } from '#/server/transactions'
import {
  searchTransactionIds,
  type TransactionSearchKey,
} from '#/lib/transaction-search'
import { DataTableCards } from '#/components/app/ui/DataTableCards'
import { FacetFilter } from '#/components/app/ui/FacetFilter'
import { TransactionsSpeedDial } from './TransactionsSpeedDial'
import {
  parseCsvValues,
  serializeCsvValues,
  type TransactionsSearch,
} from './transactions-search'

type AllTransactionsTableProps = {
  transactions: VisibleTransactionListItem[]
  search: TransactionsSearch
}

const NONE_FACET = '__none__'

const COLUMN_IDS = [
  'date',
  'account',
  'type',
  'payee',
  'category',
  'tags',
  'description',
  'amount',
] as const

const multiValueFilter: FilterFn<VisibleTransactionListItem> = (
  row,
  columnId,
  filterValue,
) => {
  const selected = filterValue as string[] | undefined
  if (!selected?.length) return true
  const value = row.getValue(columnId)
  if (Array.isArray(value)) {
    return selected.some((item) => value.includes(item))
  }
  return selected.includes(String(value ?? ''))
}

function parseSort(sort: string): SortingState {
  if (!sort) return [{ id: 'date', desc: true }]
  const desc = sort.startsWith('-')
  const id = desc ? sort.slice(1) : sort
  if (!COLUMN_IDS.includes(id as (typeof COLUMN_IDS)[number])) {
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
    if (hidden.has(id)) visibility[id] = false
  }
  return visibility
}

function serializeCols(visibility: VisibilityState): string {
  return COLUMN_IDS.filter((id) => visibility[id] === false).join(',')
}

function searchToColumnFilters(search: TransactionsSearch): ColumnFiltersState {
  const filters: ColumnFiltersState = []
  const account = parseCsvValues(search.account)
  const type = parseCsvValues(search.type)
  const category = parseCsvValues(search.category)
  const payee = parseCsvValues(search.payee)
  const tags = parseCsvValues(search.tags)
  if (account.length) filters.push({ id: 'account', value: account })
  if (type.length) filters.push({ id: 'type', value: type })
  if (category.length) filters.push({ id: 'category', value: category })
  if (payee.length) filters.push({ id: 'payee', value: payee })
  if (tags.length) filters.push({ id: 'tags', value: tags })
  return filters
}

export function AllTransactionsTable({
  transactions,
  search,
}: AllTransactionsTableProps) {
  const navigate = useNavigate({ from: '/transactions/' })

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
  const columnFilters = useMemo(
    () => searchToColumnFilters(search),
    [search.account, search.type, search.category, search.payee, search.tags],
  )

  const visibleSearchKeys = useMemo(
    () =>
      COLUMN_IDS.filter(
        (id): id is TransactionSearchKey => columnVisibility[id] !== false,
      ),
    [columnVisibility],
  )
  const matchingIds = useMemo(
    () => searchTransactionIds(transactions, visibleSearchKeys, globalFilter),
    [transactions, visibleSearchKeys, globalFilter],
  )

  const facetOptions = useMemo(() => {
    const accounts = new Map<string, string>()
    const types = new Map<string, string>()
    const categories = new Map<string, string>()
    const payees = new Map<string, string>()
    const tags = new Map<string, string>()

    for (const txn of transactions) {
      const accountLabel = txn.account.isGlobal
        ? `${txn.account.name} (Global)`
        : txn.account.name
      accounts.set(txn.account.id, accountLabel)
      types.set(txn.type, transactionTypeLabel(txn.type))
      if (txn.category) {
        categories.set(txn.category.id, txn.category.name)
      } else {
        categories.set(NONE_FACET, '—')
      }
      if (txn.payee) {
        payees.set(txn.payee.id, txn.payee.name)
      } else {
        payees.set(NONE_FACET, '—')
      }
      for (const tag of txn.tags) {
        tags.set(tag.id, tag.name)
      }
    }

    return {
      account: [...accounts.entries()].map(([value, label]) => ({
        value,
        label,
      })),
      type: [...types.entries()].map(([value, label]) => ({ value, label })),
      category: [...categories.entries()].map(([value, label]) => ({
        value,
        label,
      })),
      payee: [...payees.entries()].map(([value, label]) => ({ value, label })),
      tags: [...tags.entries()].map(([value, label]) => ({ value, label })),
    }
  }, [transactions])

  function updateSearch(patch: Partial<TransactionsSearch>) {
    const next = { ...search, ...patch }
    const unchanged =
      next.page === search.page &&
      next.pageSize === search.pageSize &&
      next.sort === search.sort &&
      next.q === search.q &&
      next.cols === search.cols &&
      next.account === search.account &&
      next.type === search.type &&
      next.category === search.category &&
      next.payee === search.payee &&
      next.tags === search.tags

    if (unchanged) return

    void navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
      }),
      replace: true,
    })
  }

  function setFacetFilter(
    key: 'account' | 'type' | 'category' | 'payee' | 'tags',
    values: string[],
  ) {
    updateSearch({ [key]: serializeCsvValues(values), page: 1 })
  }

  const columns = useMemo<ColumnDef<VisibleTransactionListItem>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ getValue }) => formatTransactionDate(String(getValue())),
        sortingFn: (rowA, rowB, columnId) => {
          const a = new Date(String(rowA.getValue(columnId))).getTime()
          const b = new Date(String(rowB.getValue(columnId))).getTime()
          return a === b ? 0 : a > b ? 1 : -1
        },
        enableColumnFilter: false,
      },
      {
        id: 'account',
        accessorFn: (row) => row.account.id,
        header: 'Account',
        cell: ({ row }) => {
          const { account } = row.original
          return (
            <Link
              to="/accounts/$accountId"
              params={{ accountId: account.id }}
              search={accountDetailSearchDefaults}
              className="link link-hover"
              onClick={(event) => event.stopPropagation()}
            >
              {account.name}
              {account.isGlobal ? (
                <span className="text-base-content/50"> (Global)</span>
              ) : null}
            </Link>
          )
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.account.name
          const b = rowB.original.account.name
          return a.localeCompare(b)
        },
        filterFn: multiValueFilter,
      },
      {
        id: 'type',
        accessorFn: (row) => row.type,
        header: 'Type',
        cell: ({ row }) => transactionTypeLabel(row.original.type),
        filterFn: multiValueFilter,
      },
      {
        id: 'payee',
        accessorFn: (row) => row.payee?.id ?? NONE_FACET,
        header: 'Payee',
        cell: ({ row }) => row.original.payee?.name?.trim() || '—',
        filterFn: multiValueFilter,
      },
      {
        id: 'category',
        accessorFn: (row) => row.category?.id ?? NONE_FACET,
        header: 'Category',
        cell: ({ row }) => row.original.category?.name?.trim() || '—',
        filterFn: multiValueFilter,
      },
      {
        id: 'tags',
        accessorFn: (row) => row.tags.map((tag) => tag.id),
        getUniqueValues: (row) => row.tags.map((tag) => tag.id),
        header: 'Tags',
        cell: ({ row }) => {
          const names = row.original.tags.map((tag) => tag.name).join(', ')
          return names.trim() ? names : '—'
        },
        filterFn: multiValueFilter,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ getValue }) => {
          const value = getValue() as string | null
          return value?.trim() ? value : '—'
        },
        enableColumnFilter: false,
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
        enableColumnFilter: false,
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
    },
    autoResetPageIndex: false,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      updateSearch({ sort: serializeSort(next), page: 1 })
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(pagination) : updater
      updateSearch({
        page: next.pageIndex + 1,
        pageSize: next.pageSize,
      })
    },
    onGlobalFilterChange: (value) => {
      updateSearch({ q: String(value ?? ''), page: 1 })
    },
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(columnVisibility) : updater
      updateSearch({ cols: serializeCols(next) })
    },
    onColumnFiltersChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(columnFilters) : updater
      const read = (id: string) => {
        const filter = next.find((item) => item.id === id)
        const value = filter?.value
        return Array.isArray(value)
          ? serializeCsvValues(value.map(String))
          : ''
      }
      updateSearch({
        account: read('account'),
        type: read('type'),
        category: read('category'),
        payee: read('payee'),
        tags: read('tags'),
        page: 1,
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row) =>
      matchingIds === null || matchingIds.has(row.original.id),
    getRowId: (row) => row.id,
  })

  const facetCounts = {
    account: table.getColumn('account')!.getFacetedUniqueValues() as Map<
      string,
      number
    >,
    type: table.getColumn('type')!.getFacetedUniqueValues() as Map<string, number>,
    category: table.getColumn('category')!.getFacetedUniqueValues() as Map<
      string,
      number
    >,
    payee: table.getColumn('payee')!.getFacetedUniqueValues() as Map<
      string,
      number
    >,
    tags: table.getColumn('tags')!.getFacetedUniqueValues() as Map<string, number>,
  }

  const pageCount = table.getPageCount()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 app-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="input input-bordered flex min-w-56 items-center gap-2">
            <HiOutlineSearch
              className="size-4 shrink-0 text-base-content/60"
              aria-hidden
            />
            <input
              type="search"
              className="grow placeholder:text-base-content/50"
              value={globalFilter}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              placeholder="Search description, type…"
              aria-label="Search transactions"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <FacetFilter
              counts={facetCounts.account}
              label="Account"
              options={facetOptions.account}
              selected={parseCsvValues(search.account)}
              onChange={(next) => setFacetFilter('account', next)}
            />
            <FacetFilter
              counts={facetCounts.type}
              label="Type"
              options={facetOptions.type}
              selected={parseCsvValues(search.type)}
              onChange={(next) => setFacetFilter('type', next)}
            />
            <FacetFilter
              counts={facetCounts.category}
              label="Category"
              options={facetOptions.category}
              selected={parseCsvValues(search.category)}
              onChange={(next) => setFacetFilter('category', next)}
            />
            <FacetFilter
              counts={facetCounts.payee}
              label="Payee"
              options={facetOptions.payee}
              selected={parseCsvValues(search.payee)}
              onChange={(next) => setFacetFilter('payee', next)}
            />
            <FacetFilter
              counts={facetCounts.tags}
              label="Tags"
              options={facetOptions.tags}
              selected={parseCsvValues(search.tags)}
              onChange={(next) => setFacetFilter('tags', next)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <Link to="/transactions/new" className="btn btn-primary gap-2">
            <HiPlus className="size-4" aria-hidden />
            Add transaction
          </Link>
        </div>
      </div>

      <DataTableCards
        table={table}
        emptyMessage={
          transactions.length === 0
            ? 'No transactions yet across your accounts.'
            : 'No transactions match the current filters.'
        }
        onRowClick={(tx) => {
          void navigate({
            to: '/transactions/$transactionId',
            params: { transactionId: tx.id },
          })
        }}
        className="app-card p-3"
      />
      <div className="hidden overflow-x-auto app-card md:block">
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
                  {transactions.length === 0
                    ? 'No transactions yet across your accounts.'
                    : 'No transactions match the current filters.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
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
                        cell.column.id === 'account'
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

      <TransactionsSpeedDial />
    </div>
  )
}
