import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ColorField } from '#/components/app/accounts/taxonomy-form-fields'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
import type { TagRecord } from '#/lib/taxonomy-types'
import { createTag, updateTag } from '#/server/taxonomies'

type TagsSettingsPanelProps = {
  tags: TagRecord[]
}

export function TagsSettingsPanel({ tags }: TagsSettingsPanelProps) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [bgColor, setBgColor] = useState('')
  const [textColor, setTextColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditingId(null)
    setName('')
    setBgColor('')
    setTextColor('')
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(tag: TagRecord) {
    setEditingId(tag.id)
    setName(tag.name)
    setBgColor(tag.bgColor ?? '')
    setTextColor(tag.textColor ?? '')
    setError(null)
    setShowForm(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { name, bgColor, textColor }
      if (editingId) {
        await updateTag({ data: { id: editingId, ...payload } })
      } else {
        await createTag({ data: payload })
      }
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save tag.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-base-content">
            Tags
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            Labels you can attach to transactions for filtering and reporting.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={startAdd}
          >
            Add tag
          </button>
        ) : null}
      </div>

      {showForm ? (
        <FormShell
          card={false}
          onSubmit={save}
          className="mt-4 rounded-box border border-base-300 p-4"
        >
          <FormField label="Name" htmlFor="tag-name">
            <input
              id="tag-name"
              className={FORM_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormRow>
            <ColorField
              id="tag-bg-color"
              label="Background color"
              value={bgColor}
              onBlur={() => {}}
              onChange={setBgColor}
            />
            <ColorField
              id="tag-text-color"
              label="Text color"
              value={textColor}
              onBlur={() => {}}
              onChange={setTextColor}
            />
          </FormRow>
          <FormField label="Preview">
            <TaxonomyBadge
              name={name.trim() || 'Tag name'}
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : editingId ? 'Update tag' : 'Create tag'}
            </button>
          </FormActions>
        </FormShell>
      ) : tags.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          No tags yet. Add one to label transactions.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <TaxonomyBadge
                  name={tag.name}
                  bgColor={tag.bgColor}
                  textColor={tag.textColor}
                  size="lg"
                />
              </div>
              <div className="mt-auto flex justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => startEdit(tag)}
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
