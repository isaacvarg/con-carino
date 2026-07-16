import { useNavigate } from '@tanstack/react-router'
import { useMemo, useRef } from 'react'
import { HiOutlineSearch } from 'react-icons/hi'
import { TaxonomyCreateDialog } from '#/components/app/accounts/TaxonomyCreateDialog'
import { DocumentThumbCard } from '#/components/app/documents/DocumentThumbCard'
import { DocumentUploadForm } from '#/components/app/documents/DocumentUploadDialog'
import type { DocumentsSearch } from '#/components/app/documents/documents-search'
import { FacetFilter } from '#/components/app/ui/FacetFilter'
import { searchDocuments } from '#/lib/document-search'
import type { DocumentListItem, DocumentTypeRecord } from '#/lib/document-types'
import { parseCsvValues, serializeCsvValues } from '#/lib/search-params'

type DocumentsGridProps = {
  documents: DocumentListItem[]
  documentTypes: DocumentTypeRecord[]
  search: DocumentsSearch
}

export function DocumentsGrid({
  documents,
  documentTypes,
  search,
}: DocumentsGridProps) {
  const navigate = useNavigate({ from: '/documents/' })
  const uploadDialogRef = useRef<HTMLDialogElement>(null)

  const selectedTypes = parseCsvValues(search.type)

  function updateSearch(patch: Partial<DocumentsSearch>) {
    const next = { ...search, ...patch }
    // Bail when nothing actually changed, or navigate loops.
    if (next.q === search.q && next.type === search.type) return

    void navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
      }),
      replace: true,
    })
  }

  const searched = useMemo(
    () => searchDocuments(documents, search.q),
    [documents, search.q],
  )

  // Counts track the search but not the type facet's own selection, matching
  // how TanStack's faceted row model behaves for a single facet dimension.
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const document of searched) {
      counts.set(document.type.id, (counts.get(document.type.id) ?? 0) + 1)
    }
    return counts
  }, [searched])

  const visible = useMemo(() => {
    if (selectedTypes.length === 0) return searched
    const allowed = new Set(selectedTypes)
    return searched.filter((document) => allowed.has(document.type.id))
  }, [searched, selectedTypes])

  const typeOptions = useMemo(
    () =>
      documentTypes.map((type) => ({ value: type.id, label: type.name })),
    [documentTypes],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="input input-bordered flex items-center gap-2">
            <HiOutlineSearch className="size-4 text-base-content/50" aria-hidden />
            <input
              type="search"
              className="grow placeholder:text-base-content/50"
              value={search.q}
              onChange={(event) => updateSearch({ q: event.target.value })}
              placeholder="Search name, file, type…"
              aria-label="Search documents"
            />
          </label>
          <FacetFilter
            counts={typeCounts}
            label="Type"
            options={typeOptions}
            selected={selectedTypes}
            onChange={(next) => updateSearch({ type: serializeCsvValues(next) })}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => uploadDialogRef.current?.showModal()}
        >
          Upload document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-box bg-base-100 p-8 text-center shadow-sm">
          <p className="text-base-content/60">
            No documents yet. Upload one to start your library.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-box bg-base-100 p-8 text-center shadow-sm">
          <p className="text-base-content/60">
            No documents match your search or filters.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((document) => (
            <DocumentThumbCard key={document.id} document={document} />
          ))}
        </ul>
      )}

      <TaxonomyCreateDialog ref={uploadDialogRef} title="Upload document">
        <DocumentUploadForm
          dialogRef={uploadDialogRef}
          documentTypes={documentTypes}
        />
      </TaxonomyCreateDialog>
    </div>
  )
}
