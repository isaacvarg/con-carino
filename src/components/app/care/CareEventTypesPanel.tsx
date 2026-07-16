import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ColorField } from '#/components/app/accounts/taxonomy-form-fields'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
import type { CareEventTypeDto } from '#/server/care'
import { createCareEventType, updateCareEventType } from '#/server/care'
import {
  DEFAULT_EVENT_BG_COLOR,
  DEFAULT_EVENT_TEXT_COLOR,
  personChipStyle,
} from './care-utils'

type CareEventTypesPanelProps = {
  eventTypes: CareEventTypeDto[]
}

export function CareEventTypesPanel({ eventTypes }: CareEventTypesPanelProps) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [bgColor, setBgColor] = useState(DEFAULT_EVENT_BG_COLOR)
  const [textColor, setTextColor] = useState(DEFAULT_EVENT_TEXT_COLOR)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetForm() {
    setEditingId(null)
    setName('')
    setBgColor(DEFAULT_EVENT_BG_COLOR)
    setTextColor(DEFAULT_EVENT_TEXT_COLOR)
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(type: CareEventTypeDto) {
    setEditingId(type.id)
    setName(type.name)
    setBgColor(type.bgColor)
    setTextColor(type.textColor)
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
        await updateCareEventType({ data: { id: editingId, ...payload } })
      } else {
        await createCareEventType({ data: payload })
      }
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save event type.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-base-content">
            Event types
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            Categories for appointments and events, and how they appear on the
            calendar.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={startAdd}
          >
            Add event type
          </button>
        ) : null}
      </div>

      {showForm ? (
        <FormShell
          card={false}
          onSubmit={save}
          className="mt-4 rounded-box border border-base-300 p-4"
        >
          <FormField label="Name" htmlFor="event-type-name">
            <input
              id="event-type-name"
              className={FORM_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <FormRow>
            <ColorField
              id="event-type-bg-color"
              label="Background color"
              value={bgColor}
              onBlur={() => {}}
              onChange={setBgColor}
            />
            <ColorField
              id="event-type-text-color"
              label="Text color"
              value={textColor}
              onBlur={() => {}}
              onChange={setTextColor}
            />
          </FormRow>
          <FormField label="Preview">
            <span
              className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium"
              style={personChipStyle(bgColor, textColor)}
            >
              {name.trim() || 'Event title'}
            </span>
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
                  ? 'Update event type'
                  : 'Create event type'}
            </button>
          </FormActions>
        </FormShell>
      ) : eventTypes.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          No event types yet. Add one to categorize appointments and events.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {eventTypes.map((type) => (
            <li
              key={type.id}
              className="flex flex-col gap-3 app-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium"
                  style={personChipStyle(type.bgColor, type.textColor)}
                >
                  {type.name}
                </span>
              </div>
              <div className="mt-auto flex justify-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => startEdit(type)}
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
