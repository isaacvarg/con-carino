import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
  FormRow,
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
} from '#/server/care'
import { PERSON_COLOR_OPTIONS } from './care-utils'

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [personError, setPersonError] = useState<string | null>(null)
  const [personSaving, setPersonSaving] = useState(false)

  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [userId, setUserId] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [color, setColor] = useState(PERSON_COLOR_OPTIONS[0]!)
  const [isActive, setIsActive] = useState(true)

  const [typeName, setTypeName] = useState('')
  const [typeIsPaid, setTypeIsPaid] = useState(false)
  const [typeRate, setTypeRate] = useState('25')
  const [typeError, setTypeError] = useState<string | null>(null)

  function resetPersonForm() {
    setEditingId(null)
    setName('')
    setTypeId(types[0]?.id ?? '')
    setUserId('')
    setHourlyRate('')
    setColor(PERSON_COLOR_OPTIONS[0]!)
    setIsActive(true)
    setPersonError(null)
    setShowPersonForm(false)
  }

  function startEdit(person: CarePersonDto) {
    setEditingId(person.id)
    setName(person.name)
    setTypeId(person.typeId)
    setUserId(person.userId ?? '')
    setHourlyRate(person.hourlyRate ?? '')
    setColor(person.color ?? PERSON_COLOR_OPTIONS[0]!)
    setIsActive(person.isActive)
    setShowPersonForm(true)
    setPersonError(null)
  }

  async function savePerson(e: FormEvent) {
    e.preventDefault()
    setPersonSaving(true)
    setPersonError(null)
    try {
      const payload = {
        name,
        typeId,
        userId: userId || null,
        hourlyRate: hourlyRate || null,
        color,
        isActive,
      }
      if (editingId) {
        await updateCarePerson({ data: { id: editingId, ...payload } })
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

  async function saveType(e: FormEvent) {
    e.preventDefault()
    setTypeError(null)
    try {
      await createCarePersonType({
        data: {
          name: typeName,
          isPaid: typeIsPaid,
          defaultHourlyRate: typeIsPaid ? typeRate : null,
        },
      })
      setTypeName('')
      setTypeIsPaid(false)
      setTypeRate('25')
      await router.invalidate()
    } catch (err) {
      setTypeError(
        err instanceof Error ? err.message : 'Could not create type.',
      )
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base-content">People</h3>
            <p className="mt-1 text-sm text-base-content/60">
              App users and offline family or employees who can be scheduled.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetPersonForm()
              setShowPersonForm(true)
            }}
          >
            Add person
          </button>
        </div>

        {showPersonForm ? (
          <FormShell
            card={false}
            onSubmit={savePerson}
            className="mt-4 rounded-box border border-base-300 p-4"
          >
            <FormRow>
              <FormField label="Name" htmlFor="person-name">
                <input
                  id="person-name"
                  className={FORM_INPUT_CLASS}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Type" htmlFor="person-type">
                <select
                  id="person-type"
                  className={FORM_SELECT_CLASS}
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  required
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isPaid ? ' (paid)' : ''}
                    </option>
                  ))}
                </select>
              </FormField>
            </FormRow>
            <FormRow>
              <FormField
                label="Linked app user (optional)"
                htmlFor="person-user"
              >
                <select
                  id="person-user"
                  className={FORM_SELECT_CLASS}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">None — offline person</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email || u.id}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Hourly rate override"
                htmlFor="person-rate"
              >
                <input
                  id="person-rate"
                  className={FORM_INPUT_CLASS}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="Use type default"
                  inputMode="decimal"
                />
              </FormField>
            </FormRow>
            <FormField label="Calendar color">
              <div className="flex flex-wrap gap-2">
                {PERSON_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    className={`size-8 rounded-full border-2 ${
                      color === c ? 'border-base-content' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </FormField>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="text-sm font-medium text-base-content">
                Active
              </span>
            </label>
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
                  : editingId
                    ? 'Update person'
                    : 'Create person'}
              </button>
            </FormActions>
          </FormShell>
        ) : null}

        <ul className="mt-4 divide-y divide-base-300">
          {people.length === 0 ? (
            <li className="py-4 text-sm text-base-content/60">
              No people yet. Add family or employees to schedule coverage.
            </li>
          ) : (
            people.map((person) => (
              <li
                key={person.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{
                      backgroundColor: person.color ?? '#94a3b8',
                    }}
                  />
                  <div>
                    <p className="font-medium text-base-content">
                      {person.name}
                      {!person.isActive ? (
                        <span className="ml-2 badge badge-ghost badge-sm">
                          Inactive
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-base-content/60">
                      {person.typeName}
                      {person.isPaid
                        ? ` · $${person.effectiveHourlyRate ?? '—'}/hr`
                        : ''}
                      {person.userEmail
                        ? ` · ${person.userName || person.userEmail}`
                        : ' · Offline'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => startEdit(person)}
                >
                  Edit
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
        <h3 className="font-semibold text-base-content">Person types</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {types.map((t) => (
            <li key={t.id} className="badge badge-outline gap-1 py-3">
              {t.name}
              {t.isPaid
                ? ` · paid $${t.defaultHourlyRate ?? '—'}/hr`
                : ' · unpaid'}
            </li>
          ))}
        </ul>
        <FormShell card={false} onSubmit={saveType} className="mt-4">
          <FormRow>
            <FormField label="New type name" htmlFor="type-name">
              <input
                id="type-name"
                className={FORM_INPUT_CLASS}
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Default hourly rate" htmlFor="type-rate">
              <input
                id="type-rate"
                className={FORM_INPUT_CLASS}
                value={typeRate}
                onChange={(e) => setTypeRate(e.target.value)}
                disabled={!typeIsPaid}
                inputMode="decimal"
              />
            </FormField>
          </FormRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="checkbox"
              checked={typeIsPaid}
              onChange={(e) => setTypeIsPaid(e.target.checked)}
            />
            <span className="text-sm font-medium text-base-content">
              Must be paid
            </span>
          </label>
          {typeError ? (
            <p className="text-sm text-error" role="alert">
              {typeError}
            </p>
          ) : null}
          <FormActions>
            <button type="submit" className="btn btn-secondary">
              Add type
            </button>
          </FormActions>
        </FormShell>
      </div>
    </div>
  )
}
