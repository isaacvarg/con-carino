import { useState } from 'react'
import { HiPlus, HiX } from 'react-icons/hi'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import { TaxonomyPickerDialog } from '#/components/app/transactions/TaxonomyPickerDialog'
import type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'

type TagSelectFieldProps = {
  options: ColoredTaxonomyRef[]
  value: string[]
  onChange: (ids: string[]) => void
  onRequestCreate: () => void
}

/** Horizontal badge list for the selected tags, plus a searchable picker. */
export function TagSelectField({
  options,
  value,
  onChange,
  onRequestCreate,
}: TagSelectFieldProps) {
  const [open, setOpen] = useState(false)
  // Order by the option list so the badges stay name-sorted as tags are added.
  const selected = options.filter((option) => value.includes(option.id))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((tag) => (
          <TaxonomyBadge
            key={tag.id}
            size="lg"
            name={tag.name}
            bgColor={tag.bgColor}
            textColor={tag.textColor}
            className="gap-1.5 pe-1.5"
          >
            {tag.name}
            <button
              type="button"
              className="rounded-full p-0.5 transition hover:bg-black/20"
              aria-label={`Remove ${tag.name}`}
              onClick={() => onChange(value.filter((id) => id !== tag.id))}
            >
              <HiX className="size-3.5" aria-hidden />
            </button>
          </TaxonomyBadge>
        ))}
        <button
          type="button"
          className="btn btn-outline btn-sm gap-1.5"
          onClick={() => setOpen(true)}
        >
          <HiPlus className="size-4" aria-hidden />
          {selected.length === 0 ? 'Add tags' : 'Edit tags'}
        </button>
      </div>

      <TaxonomyPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Select tags"
        options={options}
        mode="multi"
        selectedIds={value}
        onSelect={(id) =>
          onChange(
            value.includes(id)
              ? value.filter((item) => item !== id)
              : [...value, id],
          )
        }
        onClear={() => onChange([])}
        onRequestCreate={() => {
          setOpen(false)
          onRequestCreate()
        }}
        createLabel="New tag"
        emptyLabel="No tags yet — create one to get started."
      />
    </>
  )
}
