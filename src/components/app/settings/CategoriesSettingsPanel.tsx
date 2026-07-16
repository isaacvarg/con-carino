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
import type { CategoryRecord } from '#/lib/taxonomy-types'
import { createCategory, updateCategory } from '#/server/taxonomies'

type CategoriesSettingsPanelProps = {
  categories: CategoryRecord[]
}

export function CategoriesSettingsPanel({
  categories,
}: CategoriesSettingsPanelProps) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [isExpenditure, setIsExpenditure] = useState(true)
  const [bgColor, setBgColor] = useState('')
  const [textColor, setTextColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditingId(null)
    setName('')
    setIsExpenditure(true)
    setBgColor('')
    setTextColor('')
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(category: CategoryRecord) {
    setEditingId(category.id)
    setName(category.name)
    setIsExpenditure(category.isExpenditure)
    setBgColor(category.bgColor ?? '')
    setTextColor(category.textColor ?? '')
    setError(null)
    setShowForm(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { name, isExpenditure, bgColor, textColor }
      if (editingId) {
        await updateCategory({ data: { id: editingId, ...payload } })
      } else {
        await createCategory({ data: payload })
      }
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save category.',
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
            Categories
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            Group transactions by spending or income category.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={startAdd}
          >
            Add category
          </button>
        ) : null}
      </div>

      {showForm ? (
        <FormShell
          card={false}
          onSubmit={save}
          className="mt-4 rounded-box border border-base-300 p-4"
        >
          <FormField label="Name" htmlFor="category-name">
            <input
              id="category-name"
              className={FORM_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={isExpenditure}
              onChange={(e) => setIsExpenditure(e.target.checked)}
            />
            <span className="label-text font-medium">Expenditure</span>
          </label>
          <FormRow>
            <ColorField
              id="category-bg-color"
              label="Background color"
              value={bgColor}
              onBlur={() => {}}
              onChange={setBgColor}
            />
            <ColorField
              id="category-text-color"
              label="Text color"
              value={textColor}
              onBlur={() => {}}
              onChange={setTextColor}
            />
          </FormRow>
          <FormField label="Preview">
            <TaxonomyBadge
              name={name.trim() || 'Category name'}
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
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Update category'
                  : 'Create category'}
            </button>
          </FormActions>
        </FormShell>
      ) : categories.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          No categories yet. Add one to classify transactions.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-col gap-3 app-card p-4"
            >
              <div className="flex flex-col items-start gap-2">
                <TaxonomyBadge
                  name={category.name}
                  bgColor={category.bgColor}
                  textColor={category.textColor}
                  size="lg"
                />
                <span className="text-xs text-base-content/60">
                  {category.isExpenditure ? 'Expenditure' : 'Income'}
                </span>
              </div>
              <div className="mt-auto flex justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => startEdit(category)}
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
