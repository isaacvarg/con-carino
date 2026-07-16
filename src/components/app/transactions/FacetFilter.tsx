import type { Column } from '@tanstack/react-table'

type FacetOption = {
  value: string
  label: string
}

type FacetFilterProps<TData> = {
  column: Column<TData, unknown>
  label: string
  options: FacetOption[]
  selected: string[]
  onChange: (next: string[]) => void
}

export function FacetFilter<TData>({
  column,
  label,
  options,
  selected,
  onChange,
}: FacetFilterProps<TData>) {
  const faceted = column.getFacetedUniqueValues()
  const selectedSet = new Set(selected)
  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label))

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((item) => item !== value))
      return
    }
    onChange([...selected, value])
  }

  const buttonLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? `${label} (1)`
        : `${label} (${selected.length})`

  return (
    <div className="dropdown">
      <button type="button" tabIndex={0} className="btn btn-outline">
        {buttonLabel}
      </button>
      <div
        tabIndex={0}
        className="dropdown-content z-20 mt-2 w-64 rounded-box border border-base-200 bg-base-100 p-2 shadow"
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="text-sm font-medium text-base-content">{label}</span>
          {selected.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          ) : null}
        </div>
        <ul className="menu max-h-64 w-full overflow-y-auto p-0">
          {sorted.length === 0 ? (
            <li className="px-2 py-1 text-sm text-base-content/60">
              No options
            </li>
          ) : (
            sorted.map((option) => {
              const count = faceted.get(option.value) ?? 0
              return (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={selectedSet.has(option.value)}
                      onChange={() => toggle(option.value)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    <span className="badge badge-ghost badge-sm tabular-nums">
                      {count}
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
