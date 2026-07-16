import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ColorField } from '#/components/app/accounts/taxonomy-form-fields'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import {
  FORM_INPUT_CLASS,
  FORM_TEXTAREA_CLASS,
  FormActions,
  FormField,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
import {
  DEFAULT_DOCUMENT_TYPE_BG_COLOR,
  DEFAULT_DOCUMENT_TYPE_TEXT_COLOR,
  type DocumentTypeRecord,
} from '#/lib/document-types'
import { createDocumentType, updateDocumentType } from '#/server/documents'

type DocumentTypesSettingsPanelProps = {
  documentTypes: DocumentTypeRecord[]
}

export function DocumentTypesSettingsPanel({
  documentTypes,
}: DocumentTypesSettingsPanelProps) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [bgColor, setBgColor] = useState(DEFAULT_DOCUMENT_TYPE_BG_COLOR)
  const [textColor, setTextColor] = useState(DEFAULT_DOCUMENT_TYPE_TEXT_COLOR)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditingId(null)
    setName('')
    setDescription('')
    setBgColor(DEFAULT_DOCUMENT_TYPE_BG_COLOR)
    setTextColor(DEFAULT_DOCUMENT_TYPE_TEXT_COLOR)
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(documentType: DocumentTypeRecord) {
    setEditingId(documentType.id)
    setName(documentType.name)
    setDescription(documentType.description ?? '')
    setBgColor(documentType.bgColor)
    setTextColor(documentType.textColor)
    setError(null)
    setShowForm(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { name, description, bgColor, textColor }
      if (editingId) {
        await updateDocumentType({ data: { id: editingId, ...payload } })
      } else {
        await createDocumentType({ data: payload })
      }
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save document type.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-base-content">
            Document types
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            Categories for documents in your library, controlling how each one
            is labelled.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={startAdd}
          >
            Add document type
          </button>
        ) : null}
      </div>

      {showForm ? (
        <FormShell
          card={false}
          onSubmit={save}
          className="mt-4 rounded-box border border-base-300 p-4"
        >
          <FormField label="Name" htmlFor="document-type-name">
            <input
              id="document-type-name"
              className={FORM_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Description" htmlFor="document-type-description">
            <textarea
              id="document-type-description"
              className={FORM_TEXTAREA_CLASS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </FormField>
          <FormRow>
            <ColorField
              id="document-type-bg-color"
              label="Background color"
              value={bgColor}
              onBlur={() => {}}
              onChange={setBgColor}
            />
            <ColorField
              id="document-type-text-color"
              label="Text color"
              value={textColor}
              onBlur={() => {}}
              onChange={setTextColor}
            />
          </FormRow>
          <FormField label="Preview">
            <TaxonomyBadge
              name={name.trim() || 'Document type'}
              bgColor={bgColor || null}
              textColor={textColor || null}
              size="lg"
            />
          </FormField>
          {error ? (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          ) : null}
          <FormActions>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Update document type'
                  : 'Create document type'}
            </button>
          </FormActions>
        </FormShell>
      ) : documentTypes.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          No document types yet. Add one to categorize your documents.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documentTypes.map((documentType) => (
            <li
              key={documentType.id}
              className="flex flex-col gap-3 app-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <TaxonomyBadge
                  name={documentType.name}
                  bgColor={documentType.bgColor}
                  textColor={documentType.textColor}
                  size="lg"
                />
              </div>
              {documentType.description ? (
                <p className="text-sm text-base-content/60">
                  {documentType.description}
                </p>
              ) : null}
              <div className="mt-auto flex justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => startEdit(documentType)}
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
