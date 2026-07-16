import { useState } from 'react'
import { TaxonomyPickerDialog } from '#/components/app/transactions/TaxonomyPickerDialog'
import { taxonomyBadgeStyle } from '#/lib/taxonomy-badge'
import type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'

const RECTANGLE_CLASS =
  'flex min-h-12 w-full items-center rounded-box px-4 py-3 font-medium'

function rectangleSurface(selected: ColoredTaxonomyRef | null) {
  const style = selected
    ? taxonomyBadgeStyle(selected.bgColor, selected.textColor)
    : {}
  const hasColor = Boolean(style.backgroundColor)
  const surface = selected
    ? hasColor
      ? ''
      : 'bg-base-200 text-base-content'
    : 'border border-dashed border-base-300 text-base-content/50'
  return { style, surface }
}

type TaxonomyRectangleProps = {
  selected: ColoredTaxonomyRef | null
  placeholder: string
}

/** Read-only full-width colored rectangle for a single taxonomy. */
export function TaxonomyRectangle({
  selected,
  placeholder,
}: TaxonomyRectangleProps) {
  const { style, surface } = rectangleSurface(selected)
  return (
    <div className={`${RECTANGLE_CLASS} ${surface}`} style={style}>
      <span className="truncate">{selected ? selected.name : placeholder}</span>
    </div>
  )
}

type TaxonomySelectFieldProps = {
  title: string
  options: ColoredTaxonomyRef[]
  value: string
  onChange: (id: string) => void
  onRequestCreate: () => void
  createLabel: string
  emptyLabel: string
  placeholder: string
}

/** Clickable rectangle opening a searchable picker (payee, category). */
export function TaxonomySelectField({
  title,
  options,
  value,
  onChange,
  onRequestCreate,
  createLabel,
  emptyLabel,
  placeholder,
}: TaxonomySelectFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.id === value) ?? null
  const { style, surface } = rectangleSurface(selected)

  return (
    <>
      <button
        type="button"
        className={`${RECTANGLE_CLASS} ${surface} text-left transition hover:opacity-80`}
        style={style}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">
          {selected ? selected.name : placeholder}
        </span>
      </button>

      <TaxonomyPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        options={options}
        mode="single"
        selectedIds={selected ? [selected.id] : []}
        onSelect={(id) => {
          onChange(id === value ? '' : id)
          setOpen(false)
        }}
        onClear={() => {
          onChange('')
          setOpen(false)
        }}
        onRequestCreate={() => {
          setOpen(false)
          onRequestCreate()
        }}
        createLabel={createLabel}
        emptyLabel={emptyLabel}
      />
    </>
  )
}
