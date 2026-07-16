import { useForm } from '@tanstack/react-form'
import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { HiOutlinePencil } from 'react-icons/hi'
import { DocumentViewer } from '#/components/app/documents/DocumentViewer'
import { documentsSearchDefaults } from '#/components/app/documents/documents-search'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
  FormFieldError,
} from '#/components/app/ui/form'
import type { DocumentListItem, DocumentTypeRecord } from '#/lib/document-types'
import { formatBytes } from '#/lib/format-bytes'
import { updateDocument } from '#/server/documents'

type EditFormValues = {
  name: string
  documentTypeId: string
}

type DocumentDetailPanelProps = {
  document: DocumentListItem
  documentTypes: DocumentTypeRecord[]
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function DocumentDetailPanel({
  document,
  documentTypes,
}: DocumentDetailPanelProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      name: document.name,
      documentTypeId: document.type.id,
    } satisfies EditFormValues,
    onSubmit: async ({ value }) => {
      setSubmitError(null)
      try {
        await updateDocument({
          data: {
            id: document.id,
            name: value.name,
            documentTypeId: value.documentTypeId,
          },
        })
        await router.invalidate()
        setEditing(false)
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'Could not save document.',
        )
      }
    },
  })

  function startEditing() {
    form.reset({
      name: document.name,
      documentTypeId: document.type.id,
    })
    setSubmitError(null)
    setEditing(true)
  }

  function cancelEditing() {
    form.reset({
      name: document.name,
      documentTypeId: document.type.id,
    })
    setSubmitError(null)
    setEditing(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-base-content">
            Document details
          </h2>
          <p className="text-sm text-base-content/60">
            {formatUploadedAt(document.createdAt)} ·{' '}
            {formatBytes(document.byteSize)}
          </p>
        </div>
        <Link
          to="/documents"
          search={documentsSearchDefaults}
          className="btn btn-ghost btn-sm"
        >
          All documents
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DocumentViewer document={document} />
        </div>

        <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
          {editing ? (
            <form
              className="app-form"
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void form.handleSubmit()
              }}
            >
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) =>
                    value.trim() ? undefined : 'Name is required.',
                }}
              >
                {(field) => {
                  const errorId = `${field.name}-error`
                  const hasError = field.state.meta.errors.length > 0
                  return (
                    <FormField
                      label="Name"
                      htmlFor={field.name}
                      error={
                        <FormFieldError id={errorId} errors={field.state.meta.errors} />
                      }
                    >
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        className={FORM_INPUT_CLASS}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={hasError}
                        aria-describedby={hasError ? errorId : undefined}
                        autoFocus
                      />
                    </FormField>
                  )
                }}
              </form.Field>

              <form.Field name="documentTypeId">
                {(field) => (
                  <FormField label="Type" htmlFor={field.name}>
                    <select
                      id={field.name}
                      name={field.name}
                      className={FORM_SELECT_CLASS}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    >
                      {documentTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
              </form.Field>

              {submitError ? (
                <p className="text-sm text-error" role="alert">
                  {submitError}
                </p>
              ) : null}

              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting] as const}
              >
                {([canSubmit, isSubmitting]) => (
                  <FormActions>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!canSubmit || isSubmitting}
                    >
                      {isSubmitting ? 'Saving…' : 'Save document'}
                    </button>
                  </FormActions>
                )}
              </form.Subscribe>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-bold tracking-tight text-base-content">
                  {document.name}
                </h3>
                <button
                  type="button"
                  className="btn btn-outline btn-sm shrink-0 gap-1.5"
                  onClick={startEditing}
                >
                  <HiOutlinePencil className="size-4" aria-hidden />
                  Edit
                </button>
              </div>

              <div>
                <p className="text-sm text-base-content/60">Type</p>
                <div className="mt-1">
                  <TaxonomyBadge
                    name={document.type.name}
                    bgColor={document.type.bgColor}
                    textColor={document.type.textColor}
                    size="lg"
                  />
                </div>
              </div>

              <dl className="flex flex-col gap-3 border-t border-base-300 pt-4 text-sm">
                <div>
                  <dt className="text-base-content/60">File</dt>
                  <dd className="mt-0.5 break-all text-base-content">
                    {document.fileName}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/60">Size</dt>
                  <dd className="mt-0.5 text-base-content">
                    {formatBytes(document.byteSize)}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/60">Uploaded</dt>
                  <dd className="mt-0.5 text-base-content">
                    {formatUploadedAt(document.createdAt)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
