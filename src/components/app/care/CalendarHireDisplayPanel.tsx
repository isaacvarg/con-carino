import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormShell,
} from '#/components/app/ui/form'
import { DEFAULT_HIRE_CALENDAR_LABEL, formatHireCalendarLabel } from '#/lib/care-hire-label'
import {
  updateCalendarDisplaySettings,
  type CareSettingsDto,
} from '#/server/care'
import { personChipStyle } from './care-utils'

type CalendarHireDisplayPanelProps = {
  settings: CareSettingsDto
}

const PREVIEW_ORIGINAL = 'Alex'
const PREVIEW_EMPLOYED = 'Jordan'
const PREVIEW_ORIGIN_STYLE = personChipStyle('#cba6f7', '#1e1e2e')
const PREVIEW_EMPLOYEE_STYLE = personChipStyle('#89b4fa', '#1e1e2e')

export function CalendarHireDisplayPanel({
  settings,
}: CalendarHireDisplayPanelProps) {
  const router = useRouter()
  const [showOrigin, setShowOrigin] = useState(settings.calendarShowHireOrigin)
  const [label, setLabel] = useState(settings.calendarHireLabel)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const previewText = showOrigin
    ? formatHireCalendarLabel(label, {
        originalUser: PREVIEW_ORIGINAL,
        employedUser: PREVIEW_EMPLOYED,
      })
    : PREVIEW_EMPLOYED

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateCalendarDisplaySettings({
        data: {
          calendarShowHireOrigin: showOrigin,
          calendarHireLabel: label,
        },
      })
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save calendar display.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onSubmit={onSubmit}>
      <div>
        <h3 className="text-xl font-bold tracking-tight text-base-content">
          Hired cover on the calendar
        </h3>
        <p className="mt-1 text-sm text-base-content/60">
          When someone hires cover, the month grid can keep the original
          person&apos;s colors and show who they hired. Day detail still shows
          who pays.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-box border border-base-200 px-4 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-base-content">
            Show who hired cover on the calendar
          </span>
          <span className="mt-0.5 block text-xs text-base-content/60">
            Off shows only the hired employee, like an ordinary assignee chip.
          </span>
        </span>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={showOrigin}
          onChange={(e) => setShowOrigin(e.target.checked)}
          aria-label="Show who hired cover on the calendar"
        />
      </label>

      <FormField
        label="Label"
        htmlFor="calendar-hire-label"
        hint="Use %originalUser for who hired and %employedUser for who covers."
      >
        <input
          id="calendar-hire-label"
          className={FORM_INPUT_CLASS}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder={DEFAULT_HIRE_CALENDAR_LABEL}
          required
        />
      </FormField>

      <div>
        <p className="app-form-label">Preview</p>
        <span
          className="mt-2 inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-xs font-medium leading-snug"
          style={showOrigin ? PREVIEW_ORIGIN_STYLE : PREVIEW_EMPLOYEE_STYLE}
          title={previewText}
        >
          {previewText}
        </span>
      </div>

      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <FormActions>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </FormActions>
    </FormShell>
  )
}
