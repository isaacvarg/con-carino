import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ColorField } from '#/components/app/accounts/taxonomy-form-fields'
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
  updateCarePersonType,
} from '#/server/care'
import {
  DEFAULT_PERSON_BG_COLOR,
  DEFAULT_PERSON_TEXT_COLOR,
  personChipStyle,
} from './care-utils'

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

  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [userId, setUserId] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [bgColor, setBgColor] = useState(DEFAULT_PERSON_BG_COLOR)
  const [textColor, setTextColor] = useState(DEFAULT_PERSON_TEXT_COLOR)
  const [isActive, setIsActive] = useState(true)

  const [showTypeForm, setShowTypeForm] = useState(false)
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeIsPaid, setTypeIsPaid] = useState(false)
  const [typeRate, setTypeRate] = useState('25')
  const [typeError, setTypeError] = useState<string | null>(null)
  const [typeSaving, setTypeSaving] = useState(false)

  const selectedType = types.find((t) => t.id === typeId)
  const selectedTypeIsPaid = selectedType?.isPaid ?? false

  function resetPersonForm() {
    setEditingPersonId(null)
    setName('')
    setTypeId(types[0]?.id ?? '')
    setUserId('')
    setHourlyRate('')
    setBgColor(DEFAULT_PERSON_BG_COLOR)
    setTextColor(DEFAULT_PERSON_TEXT_COLOR)
    setIsActive(true)
    setPersonError(null)
    setShowPersonForm(false)
  }

  function startAddPerson() {
    resetPersonForm()
    setShowPersonForm(true)
  }

  function startEditPerson(person: CarePersonDto) {
    setEditingPersonId(person.id)
    setName(person.name)
    setTypeId(person.typeId)
    setUserId(person.userId ?? '')
    setHourlyRate(person.hourlyRate ?? '')
    setBgColor(person.bgColor ?? DEFAULT_PERSON_BG_COLOR)
    setTextColor(person.textColor ?? DEFAULT_PERSON_TEXT_COLOR)
    setIsActive(person.isActive)
    setShowPersonForm(true)
    setPersonError(null)
  }

  function resetTypeForm() {
    setEditingTypeId(null)
    setTypeName('')
    setTypeIsPaid(false)
    setTypeRate('25')
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
    setTypeRate(type.defaultHourlyRate ?? '25')
    setShowTypeForm(true)
    setTypeError(null)
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
        hourlyRate: selectedTypeIsPaid ? hourlyRate || null : null,
        bgColor,
        textColor,
        isActive,
      }
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

  async function saveType(e: FormEvent) {
    e.preventDefault()
    setTypeSaving(true)
    setTypeError(null)
    try {
      const payload = {
        name: typeName,
        isPaid: typeIsPaid,
        defaultHourlyRate: typeIsPaid ? typeRate : null,
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
      <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-base-content">
              People
            </h3>
            <p className="mt-1 text-sm text-base-content/60">
              App users and offline family or employees who can be scheduled.
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
                  onChange={(e) => {
                    const nextTypeId = e.target.value
                    setTypeId(nextTypeId)
                    const nextType = types.find((t) => t.id === nextTypeId)
                    if (!nextType?.isPaid) setHourlyRate('')
                  }}
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
              {selectedTypeIsPaid ? (
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
              ) : null}
            </FormRow>
            <FormRow>
              <ColorField
                id="person-bg-color"
                label="Background color"
                value={bgColor}
                onBlur={() => {}}
                onChange={setBgColor}
              />
              <ColorField
                id="person-text-color"
                label="Text color"
                value={textColor}
                onBlur={() => {}}
                onChange={setTextColor}
              />
            </FormRow>
            <FormField label="Active" htmlFor="person-active">
              <input
                id="person-active"
                type="checkbox"
                className="toggle toggle-primary"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
            </FormField>
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
                className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4"
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
                    ? ` · $${person.effectiveHourlyRate ?? '—'}/hr`
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

      <div className="rounded-box bg-base-100 p-4 shadow-sm sm:p-6">
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
            <FormField label="Must be paid" htmlFor="type-is-paid">
              <input
                id="type-is-paid"
                type="checkbox"
                className="toggle toggle-primary"
                checked={typeIsPaid}
                onChange={(e) => setTypeIsPaid(e.target.checked)}
              />
            </FormField>
            {typeIsPaid ? (
              <FormField label="Default hourly rate" htmlFor="type-rate">
                <input
                  id="type-rate"
                  className={FORM_INPUT_CLASS}
                  value={typeRate}
                  onChange={(e) => setTypeRate(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </FormField>
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
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4"
              >
                <p className="font-medium text-base-content">{t.name}</p>
                <p className="text-sm text-base-content/60">
                  {t.isPaid
                    ? `Paid · $${t.defaultHourlyRate ?? '—'}/hr`
                    : 'Unpaid'}
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
