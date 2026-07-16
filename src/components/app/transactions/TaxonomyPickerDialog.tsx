import { useEffect, useMemo, useRef, useState } from 'react'
import { HiCheck, HiOutlineSearch, HiPlus } from 'react-icons/hi'
import { FORM_INPUT_CLASS } from '#/components/app/ui/form'
import { taxonomyBadgeStyle } from '#/lib/taxonomy-badge'
import {
  createTaxonomySearchIndex,
  searchTaxonomies,
} from '#/lib/taxonomy-search'
import type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'

type TaxonomyPickerDialogProps = {
  /** Controls the native <dialog>; the field owns open/close. */
  open: boolean
  onClose: () => void
  title: string
  options: ColoredTaxonomyRef[]
  /** 'single' closes on pick; 'multi' stays open and toggles. */
  mode: 'single' | 'multi'
  selectedIds: string[]
  onSelect: (id: string) => void
  onClear: () => void
  onRequestCreate: () => void
  createLabel: string
  emptyLabel: string
}

/**
 * daisyUI Modal via HTML `<dialog class="modal">`, holding a fuzzy search box
 * over a scrollable list of colored taxonomy rows.
 *
 * Open/close is driven by the `open` prop rather than daisyUI's usual
 * `<form method="dialog">` controls: these dialogs render inside the edit
 * form, and a nested <form> is invalid HTML (it breaks hydration).
 * @see https://daisyui.com/components/modal/
 */
export function TaxonomyPickerDialog({
  open,
  onClose,
  title,
  options,
  mode,
  selectedIds,
  onSelect,
  onClear,
  onRequestCreate,
  createLabel,
  emptyLabel,
}: TaxonomyPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  const index = useMemo(() => createTaxonomySearchIndex(options), [options])
  const results = useMemo(
    () => searchTaxonomies(index, options, query),
    [index, options, query],
  )
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setQuery('')
      dialog.showModal()
      searchRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
      aria-label={title}
    >
      <div className="modal-box flex max-w-md flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-base-content">{title}</h3>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="relative">
          {/* z-10: daisyUI's .input is positioned and would otherwise paint over this. */}
          <HiOutlineSearch
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-5 -translate-y-1/2 text-base-content/40"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            className={`${FORM_INPUT_CLASS} ps-10`}
            placeholder="Search…"
            aria-label={`Search ${title.toLowerCase()}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {options.length === 0 ? (
          <p className="py-6 text-center text-sm text-base-content/60">
            {emptyLabel}
          </p>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-sm text-base-content/60">
            No matches for “{query}”.
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {results.map((option) => {
              const style = taxonomyBadgeStyle(option.bgColor, option.textColor)
              const hasColor = Boolean(style.backgroundColor)
              const isSelected = selected.has(option.id)
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    className={[
                      'flex w-full items-center justify-between gap-2 rounded-box px-4 py-3 text-left font-medium transition',
                      hasColor
                        ? 'hover:opacity-80'
                        : 'bg-base-200 text-base-content hover:bg-base-300',
                      isSelected ? 'ring-2 ring-primary ring-offset-1' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={style}
                    aria-pressed={mode === 'multi' ? isSelected : undefined}
                    onClick={() => onSelect(option.id)}
                  >
                    <span className="truncate">{option.name}</span>
                    {isSelected ? (
                      <HiCheck className="size-5 shrink-0" aria-hidden />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={onRequestCreate}
          >
            <HiPlus className="size-4" aria-hidden />
            {createLabel}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={selectedIds.length === 0}
            onClick={onClear}
          >
            Clear
          </button>
          {mode === 'multi' ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              Done
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      >
        close
      </button>
    </dialog>
  )
}
