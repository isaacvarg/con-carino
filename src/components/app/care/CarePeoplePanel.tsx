import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  CarePersonFormFields,
  carePersonFormPayload,
  type CarePersonFormValues,
} from '#/components/app/care/CarePersonFormFields'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormShell,
} from '#/components/app/ui/form'
import type {
  AppUserOption,
  CarePersonDto,
  CarePersonTypeDto,
} from '#/server/care'
import {
  createCarePerson,
  createCarePersonType,
  updateCarePerson,
  updateCarePersonType,
} from '#/server/care'
import type { CarePayInterval, CareRateType } from '#/generated/prisma/enums'
import {
  DEFAULT_PERSON_BG_COLOR,
  DEFAULT_PERSON_TEXT_COLOR,
  personChipStyle,
} from './care-utils'

const PAY_INTERVALS: Array<{ value: CarePayInterval; label: string }> = [
  { value: 'PER_SHIFT', label: 'Per shift (after shift ends)' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'MONTHLY', label: 'Monthly' },
]

function payIntervalLabel(interval: CarePayInterval): string {
  return PAY_INTERVALS.find((p) => p.value === interval)?.label ?? interval
}

function rateUnit(rateType: CareRateType): string {
  return rateType === 'DAILY' ? '/day' : '/hr'
}

function emptyPersonForm(types: CarePersonTypeDto[]): CarePersonFormValues {
  return {
    name: '',
    typeId: types[0]?.id ?? '',
    userId: '',
    hourlyRate: '',
    rateType: 'HOURLY',
    flatDailyRate: false,
    payInterval: 'PER_SHIFT',
    payWeekday: '5',
    payAnchorDate: '',
    payMonthDay: '1',
    bgColor: DEFAULT_PERSON_BG_COLOR,
    textColor: DEFAULT_PERSON_TEXT_COLOR,
    isActive: true,
  }
}

type CarePeoplePanelProps = {
  types: CarePersonTypeDto[]
  people: CarePersonDto[]
  users: AppUserOption[]
}

export function CarePeoplePanel({
  types,
  people,
  users,
}: CarePeoplePanelProps) {
  const router = useRouter()

  const [showPersonForm, setShowPersonForm] = useState(false)
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const [personError, setPersonError] = useState<string | null>(null)
  const [personSaving, setPersonSaving] = useState(false)
  const [personForm, setPersonForm] = useState<CarePersonFormValues>(() =>
    emptyPersonForm(types),
  )

  const [showTypeForm, setShowTypeForm] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeIsPaid, setTypeIsPaid] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)
  const [typeSaving, setTypeSaving] = useState(false)

  function resetPersonForm() {
    setEditingPersonId(null)
    setPersonError(null)
    setPersonForm(emptyPersonForm(types))
    setShowPersonForm(false)
  }

  function startAddPerson() {
    setEditingPersonId(null)
    setPersonError(null)
    setPersonForm(emptyPersonForm(types))
    setShowPersonForm(true)
  }

  function startEditPerson(person: CarePersonDto) {
    setEditingPersonId(person.id)
    setPersonError(null)
    setPersonForm({
      name: person.name,
      typeId: person.typeId,
      userId: person.userId ?? '',
      hourlyRate: person.hourlyRate ?? '',
      rateType: person.rateType,
      flatDailyRate: person.flatDailyRate,
      payInterval: person.payInterval,
      payWeekday: String(person.payWeekday ?? 5),
      payAnchorDate: person.payAnchorDate ?? '',
      payMonthDay: String(person.payMonthDay ?? 1),
      bgColor: person.bgColor ?? DEFAULT_PERSON_BG_COLOR,
      textColor: person.textColor ?? DEFAULT_PERSON_TEXT_COLOR,
      isActive: person.isActive,
    })
    setShowPersonForm(true)
  }

  async function savePerson(e: FormEvent) {
    e.preventDefault()
    setPersonSaving(true)
    setPersonError(null)
    const payload = carePersonFormPayload(personForm)
    try {
      if (editingPersonId) {
        await updateCarePerson({ data: { id: editingPersonId, ...payload } })
      } else {
        await createCarePerson({ data: payload })
      }
      resetPersonForm()
      await router.invalidate()
    } catch (err) {
      setPersonError(
        err instanceof Error ? err.message : 'Could not save person.',
      )
    } finally {
      setPersonSaving(false)
    }
  }

  function resetTypeForm() {
    setEditingTypeId(null)
    setTypeName('')
    setTypeIsPaid(false)
    setTypeError(null)
    setShowTypeForm(false)
  }

  function startAddType() {
    resetTypeForm()
    setShowTypeForm(true)
  }

  function startEditType(type: CarePersonTypeDto) {
    setEditingTypeId(type.id)
    setTypeName(type.name)
    setTypeIsPaid(type.isPaid)
    setShowTypeForm(true)
    setTypeError(null)
  }

  async function saveType(e: FormEvent) {
    e.preventDefault()
    setTypeSaving(true)
    setTypeError(null)
    try {
      const payload = {
        name: typeName,
        isPaid: typeIsPaid,
      }
      if (editingTypeId) {
        await updateCarePersonType({ data: { id: editingTypeId, ...payload } })
      } else {
        await createCarePersonType({ data: payload })
      }
      resetTypeForm()
      await router.invalidate()
    } catch (err) {
      setTypeError(
        err instanceof Error ? err.message : 'Could not save type.',
      )
    } finally {
      setTypeSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="app-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-base-content">
              People
            </h3>
            <p className="mt-1 text-sm text-base-content/60">
              Offline caregivers and person types. Linked app users are managed
              under Users.
            </p>
          </div>
          {!showPersonForm ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={startAddPerson}
            >
              Add person
            </button>
          ) : null}
        </div>

        {showPersonForm ? (
          <FormShell
            card={false}
            onSubmit={savePerson}
            className="mt-4 rounded-box border border-base-300 p-4"
          >
            <CarePersonFormFields
              types={types}
              users={users}
              showLinkedUser
              values={personForm}
              onChange={(patch) =>
                setPersonForm((prev) => ({ ...prev, ...patch }))
              }
            />
            {personError ? (
              <p className="text-sm text-error" role="alert">
                {personError}
              </p>
            ) : null}
            <FormActions>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetPersonForm}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={personSaving}
              >
                {personSaving
                  ? 'Saving…'
                  : editingPersonId
                    ? 'Update person'
                    : 'Create person'}
              </button>
            </FormActions>
          </FormShell>
        ) : people.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/60">
            No people yet. Add family or employees to schedule coverage.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((person) => (
              <li
                key={person.id}
                className="flex flex-col gap-3 app-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium"
                    style={
                      person.bgColor
                        ? personChipStyle(person.bgColor, person.textColor)
                        : { backgroundColor: '#94a3b8', color: '#fff' }
                    }
                  >
                    {person.name}
                  </span>
                  {!person.isActive ? (
                    <span className="badge badge-ghost badge-sm">Inactive</span>
                  ) : null}
                </div>
                <p className="text-sm text-base-content/60">
                  {person.typeName}
                  {person.isPaid
                    ? ` · $${person.effectiveHourlyRate ?? '—'}${rateUnit(person.effectiveRateType)}${person.effectiveRateType === 'DAILY' && person.flatDailyRate ? ' flat' : ''} · ${payIntervalLabel(person.payInterval)}`
                    : ''}
                  {person.userEmail
                    ? ` · ${person.userName || person.userEmail}`
                    : ' · Offline'}
                </p>
                <div className="mt-auto flex justify-end">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEditPerson(person)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="app-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-base-content">
              Person types
            </h3>
            <p className="mt-1 text-sm text-base-content/60">
              Roles used when scheduling people (family, employee, and custom).
            </p>
          </div>
          {!showTypeForm ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={startAddType}
            >
              Add type
            </button>
          ) : null}
        </div>

        {showTypeForm ? (
          <FormShell
            card={false}
            onSubmit={saveType}
            className="mt-4 rounded-box border border-base-300 p-4"
          >
            <FormField label="Name" htmlFor="type-name">
              <input
                id="type-name"
                className={FORM_INPUT_CLASS}
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Must Be Paid" htmlFor="type-is-paid">
              <input
                id="type-is-paid"
                type="checkbox"
                className="toggle toggle-primary"
                checked={typeIsPaid}
                onChange={(e) => setTypeIsPaid(e.target.checked)}
              />
            </FormField>
            {typeIsPaid ? (
              <p className="text-sm text-base-content/60">
                Rate and pay type are set on each person of this type.
              </p>
            ) : null}
            {typeError ? (
              <p className="text-sm text-error" role="alert">
                {typeError}
              </p>
            ) : null}
            <FormActions>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetTypeForm}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={typeSaving}
              >
                {typeSaving
                  ? 'Saving…'
                  : editingTypeId
                    ? 'Update type'
                    : 'Create type'}
              </button>
            </FormActions>
          </FormShell>
        ) : types.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/60">
            No person types yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 app-card p-4">
                <p className="font-medium text-base-content">{t.name}</p>
                <p className="text-sm text-base-content/60">
                  {t.isPaid ? 'Paid' : 'Unpaid'}
                </p>
                <div className="mt-auto flex justify-end">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEditType(t)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
