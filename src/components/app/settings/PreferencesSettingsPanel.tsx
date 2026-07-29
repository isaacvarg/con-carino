import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { FormActions, FormShell } from '#/components/app/ui/form'
import { clearWeekStartCache } from '#/lib/week-start-cache'
import {
  DAY_NAMES,
  orderedDayIndices,
  weekLabelFromYmd,
  weekStartYmd,
  type WeekStart,
} from '#/lib/week-start'
import { updateWeekStart } from '#/server/week-start'

type PreferencesSettingsPanelProps = {
  weekStartsOn: WeekStart
}

const WEEK_START_CHOICES: Array<{
  value: WeekStart
  label: string
  description: string
}> = [
  {
    value: 0,
    label: 'Sunday',
    description:
      'Weeks run Sunday through Saturday, on the calendar and everywhere a week is shown.',
  },
  {
    value: 1,
    label: 'Monday',
    description:
      'Weeks run Monday through Sunday, on the calendar and everywhere a week is shown.',
  },
]

export function PreferencesSettingsPanel({
  weekStartsOn: initialWeekStart,
}: PreferencesSettingsPanelProps) {
  const router = useRouter()
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStart)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Previews the choice against today, so the effect is visible before saving.
  const previewLabel = weekLabelFromYmd(weekStartYmd(new Date(), weekStartsOn))
  const previewDays = orderedDayIndices(weekStartsOn)
    .map((dow) => DAY_NAMES[dow])
    .join(' · ')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateWeekStart({ data: { weekStartsOn } })
      // The calendar and the transaction pickers read this from route context,
      // which is memoized — without dropping the memo first the invalidate
      // below would just refill it with the old value.
      clearWeekStartCache()
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save preferences.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onSubmit={onSubmit}>
      <div>
        <h3 className="font-semibold text-base-content">Preferences</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Display settings shared by everyone in the household.
        </p>
      </div>

      <fieldset>
        <legend className="font-medium text-base-content">
          Weeks start on
        </legend>
        <p className="mt-1 text-sm text-base-content/60">
          Sets where a week begins on the care calendar, the pay overview, and
          the week you can file a transaction under.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {WEEK_START_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="flex cursor-pointer items-start gap-3 rounded-box border border-base-200 px-4 py-3"
            >
              <input
                type="radio"
                name="week-starts-on"
                className="radio radio-primary mt-0.5"
                checked={weekStartsOn === choice.value}
                onChange={() => setWeekStartsOn(choice.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-base-content">
                  {choice.label}
                </span>
                <span className="mt-0.5 block text-xs text-base-content/60">
                  {choice.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-base-content/60">
          This week would be{' '}
          <span className="font-medium text-base-content">{previewLabel}</span>,
          and the calendar would read {previewDays}.
        </p>
        <p className="mt-2 text-xs text-base-content/60">
          Changing this does not move transactions already filed under a week —
          each one keeps the dates it was filed with.
        </p>
      </fieldset>

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
