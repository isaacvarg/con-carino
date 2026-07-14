import { useRouter } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent } from 'react'
import { DAY_NAMES } from '#/components/app/care/care-utils'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormShell,
} from '#/components/app/ui/form'
import { shiftsCoverFullDay } from '#/lib/care-required'
import type { CareSettingsDto } from '#/server/care'
import { upsertCareSettings } from '#/server/care'

type ShiftDraft = {
  key: string
  label: string
  startTime: string
  endTime: string
}

type LovedOneSettingsPanelProps = {
  settings: CareSettingsDto
}

function toDraftShifts(settings: CareSettingsDto): ShiftDraft[] {
  if (settings.shifts.length === 0) {
    return [
      {
        key: crypto.randomUUID(),
        label: 'Day',
        startTime: '08:00',
        endTime: '20:00',
      },
      {
        key: crypto.randomUUID(),
        label: 'Night',
        startTime: '20:00',
        endTime: '08:00',
      },
    ]
  }
  return settings.shifts.map((s) => ({
    key: s.id,
    label: s.label ?? '',
    startTime: s.startTime,
    endTime: s.endTime,
  }))
}

export function LovedOneSettingsPanel({ settings }: LovedOneSettingsPanelProps) {
  const router = useRouter()
  const [lovedOneName, setLovedOneName] = useState(settings.lovedOneName)
  const [coverageNeed, setCoverageNeed] = useState(settings.coverageNeed)
  const [coverageWindowKind, setCoverageWindowKind] = useState(
    settings.coverageWindowKind,
  )
  const [partialDaysOfWeek, setPartialDaysOfWeek] = useState<number[]>(
    settings.partialDaysOfWeek.length > 0
      ? settings.partialDaysOfWeek
      : [1, 2, 3, 4, 5],
  )
  const [shifts, setShifts] = useState<ShiftDraft[]>(() => toDraftShifts(settings))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const showFullDayWarning = useMemo(() => {
    if (coverageNeed !== 'FULL' || coverageWindowKind !== 'SHIFTS') return false
    return !shiftsCoverFullDay(shifts)
  }, [coverageNeed, coverageWindowKind, shifts])

  function toggleDay(day: number) {
    setPartialDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  function updateShift(key: string, patch: Partial<ShiftDraft>) {
    setShifts((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    )
  }

  function addShift() {
    setShifts((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        label: '',
        startTime: '09:00',
        endTime: '17:00',
      },
    ])
  }

  function removeShift(key: string) {
    setShifts((prev) =>
      prev.length <= 1 ? prev : prev.filter((s) => s.key !== key),
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await upsertCareSettings({
        data: {
          lovedOneName,
          coverageNeed,
          coverageWindowKind,
          partialDaysOfWeek:
            coverageNeed === 'PARTIAL' ? partialDaysOfWeek : [],
          shifts:
            coverageWindowKind === 'SHIFTS'
              ? shifts.map((s) => ({
                  label: s.label,
                  startTime: s.startTime,
                  endTime: s.endTime,
                }))
              : [],
        },
      })
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save loved one settings.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell onSubmit={onSubmit}>
      <div>
        <h3 className="font-semibold text-base-content">Loved one</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Name and required coverage for the person receiving care. Open slots
          are created on the care calendar from this schedule.
        </p>
      </div>

      <FormField label="Name" htmlFor="loved-one-name">
        <input
          id="loved-one-name"
          className={FORM_INPUT_CLASS}
          value={lovedOneName}
          onChange={(e) => setLovedOneName(e.target.value)}
          placeholder="e.g. Mom"
        />
      </FormField>

      <fieldset>
        <legend className="font-medium text-base-content">Coverage need</legend>
        <p className="mt-1 text-sm text-base-content/60">
          Full means every day needs coverage. Partial lets you choose which
          weekdays.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="label cursor-pointer gap-2">
            <input
              type="radio"
              className="radio radio-primary"
              checked={coverageNeed === 'FULL'}
              onChange={() => setCoverageNeed('FULL')}
            />
            <span className="label-text">Full</span>
          </label>
          <label className="label cursor-pointer gap-2">
            <input
              type="radio"
              className="radio radio-primary"
              checked={coverageNeed === 'PARTIAL'}
              onChange={() => setCoverageNeed('PARTIAL')}
            />
            <span className="label-text">Partial</span>
          </label>
        </div>
      </fieldset>

      {coverageNeed === 'PARTIAL' ? (
        <fieldset>
          <legend className="font-medium text-base-content">Days needed</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAY_NAMES.map((label, i) => (
              <label key={label} className="label cursor-pointer gap-1">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={partialDaysOfWeek.includes(i)}
                  onChange={() => toggleDay(i)}
                />
                <span className="label-text text-sm">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="font-medium text-base-content">
          Coverage windows
        </legend>
        <p className="mt-1 text-sm text-base-content/60">
          All day creates one open slot per needed day. Shifts let you split the
          day into multiple open slots.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="label cursor-pointer gap-2">
            <input
              type="radio"
              className="radio radio-primary"
              checked={coverageWindowKind === 'ALL_DAY'}
              onChange={() => setCoverageWindowKind('ALL_DAY')}
            />
            <span className="label-text">All day</span>
          </label>
          <label className="label cursor-pointer gap-2">
            <input
              type="radio"
              className="radio radio-primary"
              checked={coverageWindowKind === 'SHIFTS'}
              onChange={() => setCoverageWindowKind('SHIFTS')}
            />
            <span className="label-text">Shifts</span>
          </label>
        </div>
      </fieldset>

      {coverageWindowKind === 'SHIFTS' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-base-content/80">Shifts</h4>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addShift}
            >
              Add shift
            </button>
          </div>
          <ul className="space-y-3">
            {shifts.map((shift, index) => (
              <li
                key={shift.key}
                className="grid gap-2 rounded-lg border border-base-300 p-3 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <FormField label="Label (optional)" htmlFor={`shift-label-${shift.key}`}>
                  <input
                    id={`shift-label-${shift.key}`}
                    className={FORM_INPUT_CLASS}
                    value={shift.label}
                    onChange={(e) =>
                      updateShift(shift.key, { label: e.target.value })
                    }
                    placeholder={`Shift ${index + 1}`}
                  />
                </FormField>
                <FormField label="Start" htmlFor={`shift-start-${shift.key}`}>
                  <input
                    id={`shift-start-${shift.key}`}
                    type="time"
                    className={FORM_INPUT_CLASS}
                    value={shift.startTime}
                    onChange={(e) =>
                      updateShift(shift.key, { startTime: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="End" htmlFor={`shift-end-${shift.key}`}>
                  <input
                    id={`shift-end-${shift.key}`}
                    type="time"
                    className={FORM_INPUT_CLASS}
                    value={shift.endTime}
                    onChange={(e) =>
                      updateShift(shift.key, { endTime: e.target.value })
                    }
                    required
                  />
                </FormField>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeShift(shift.key)}
                    disabled={shifts.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {showFullDayWarning ? (
            <p className="text-sm text-warning">
              These shifts do not cover a full 24 hours. You can still save if
              that is intentional.
            </p>
          ) : null}
        </div>
      ) : null}

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
