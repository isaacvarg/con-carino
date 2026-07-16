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
import type { PayeeRecord } from '#/lib/taxonomy-types'
import { createPayee, updatePayee } from '#/server/taxonomies'

type PayeesSettingsPanelProps = {
  payees: PayeeRecord[]
}

export function PayeesSettingsPanel({ payees }: PayeesSettingsPanelProps) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [bgColor, setBgColor] = useState('')
  const [textColor, setTextColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditingId(null)
    setName('')
    setDescription('')
    setBgColor('')
    setTextColor('')
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(payee: PayeeRecord) {
    setEditingId(payee.id)
    setName(payee.name)
    setDescription(payee.description ?? '')
    setBgColor(payee.bgColor ?? '')
    setTextColor(payee.textColor ?? '')
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
        await updatePayee({ data: { id: editingId, ...payload } })
      } else {
        await createPayee({ data: payload })
      }
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payee.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-base-content">
            Payees
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            People and merchants you pay or receive money from.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={startAdd}
          >
            Add payee
          </button>
        ) : null}
      </div>

      {showForm ? (
        <FormShell
          card={false}
          onSubmit={save}
          className="mt-4 rounded-box border border-base-300 p-4"
        >
          <FormField label="Name" htmlFor="payee-name">
            <input
              id="payee-name"
              className={FORM_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormField label="Description" htmlFor="payee-description">
            <textarea
              id="payee-description"
              className={FORM_TEXTAREA_CLASS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </FormField>
          <FormRow>
            <ColorField
              id="payee-bg-color"
              label="Background color"
              value={bgColor}
              onBlur={() => {}}
              onChange={setBgColor}
            />
            <ColorField
              id="payee-text-color"
              label="Text color"
              value={textColor}
              onBlur={() => {}}
              onChange={setTextColor}
            />
          </FormRow>
          <FormField label="Preview">
            <TaxonomyBadge
              name={name.trim() || 'Payee name'}
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
              {saving ? 'Saving…' : editingId ? 'Update payee' : 'Create payee'}
            </button>
          </FormActions>
        </FormShell>
      ) : payees.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          No payees yet. Add one to reuse across transactions.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {payees.map((payee) => (
            <li
              key={payee.id}
              className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4"
            >
              <div className="flex flex-col items-start gap-2">
                <TaxonomyBadge
                  name={payee.name}
                  bgColor={payee.bgColor}
                  textColor={payee.textColor}
                  size="lg"
                />
                {payee.description ? (
                  <p className="text-xs text-base-content/60">
                    {payee.description}
                  </p>
                ) : null}
              </div>
              <div className="mt-auto flex justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => startEdit(payee)}
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
