import {
  flexRender,
  type Column,
  type Table,
} from '@tanstack/react-table'
import type { ReactNode } from 'react'

function headerLabel<T>(column: Column<T, unknown>): ReactNode {
  const header = column.columnDef.header
  if (typeof header === 'string') return header
  return column.id.charAt(0).toUpperCase() + column.id.slice(1)
}

export function DataTableCards<T>({
  table,
  emptyMessage,
  onRowClick,
  className = '',
}: {
  table: Table<T>
  emptyMessage: ReactNode
  onRowClick?: (row: T) => void
  className?: string
}) {
  const rows = table.getRowModel().rows

  if (rows.length === 0) {
    return (
      <div
        className={`md:hidden rounded-lg border border-base-300 p-8 text-center text-sm text-base-content/60 ${className}`}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <ul className={`md:hidden space-y-3 ${className}`}>
      {rows.map((row) => {
        const interactive = Boolean(onRowClick)
        return (
          <li key={row.id}>
            <div
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              className={
                interactive
                  ? 'cursor-pointer rounded-lg border border-base-300 p-4 transition-colors hover:bg-base-200/70'
                  : 'rounded-lg border border-base-300 p-4'
              }
              onClick={
                interactive
                  ? () => {
                      onRowClick?.(row.original)
                    }
                  : undefined
              }
              onKeyDown={
                interactive
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick?.(row.original)
                      }
                    }
                  : undefined
              }
            >
              <dl className="space-y-2">
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <dt className="shrink-0 text-xs font-medium text-base-content/60">
                      {headerLabel(cell.column)}
                    </dt>
                    <dd className="min-w-0 text-right text-sm text-base-content">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
