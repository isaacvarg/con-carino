import { ColorField } from '#/components/app/accounts/taxonomy-form-fields'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormField,
  FormRow,
} from '#/components/app/ui/form'
import type { AppUserOption, CarePersonTypeDto } from '#/server/care'
import type { CarePayInterval, CareRateType } from '#/generated/prisma/enums'

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

const PAY_INTERVALS: Array<{ value: CarePayInterval; label: string }> = [
  { value: 'PER_SHIFT', label: 'Per shift (after shift ends)' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'MONTHLY', label: 'Monthly' },
]

const RATE_TYPES: Array<{ value: CareRateType; label: string }> = [
  { value: 'HOURLY', label: 'Hourly' },
  { value: 'DAILY', label: 'Daily' },
]

export type CarePersonFormValues = {
  name: string
  typeId: string
  userId: string
  hourlyRate: string
  rateType: CareRateType
  flatDailyRate: boolean
  standardDaysOfWeek: number[]
  standardStartTime: string
  standardEndTime: string
  offScheduleRate: string
  payInterval: CarePayInterval
  payWeekday: string
  payAnchorDate: string
  payMonthDay: string
  bgColor: string
  textColor: string
  isActive: boolean
}

type CarePersonFormFieldsProps = {
  idPrefix?: string
  types: CarePersonTypeDto[]
  values: CarePersonFormValues
  onChange: (patch: Partial<CarePersonFormValues>) => void
  /** When set, shows the linked-app-user select (People settings). */
  users?: AppUserOption[]
  showLinkedUser?: boolean
}

export function CarePersonFormFields({
  idPrefix = 'person',
  types,
  values,
  onChange,
  users = [],
  showLinkedUser = false,
}: CarePersonFormFieldsProps) {
  const selectedType = types.find((t) => t.id === values.typeId)
  const selectedTypeIsPaid = selectedType?.isPaid ?? false

  return (
    <>
      <FormRow>
        <FormField label="Name" htmlFor={`${idPrefix}-name`}>
          <input
            id={`${idPrefix}-name`}
            className={FORM_INPUT_CLASS}
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            required
          />
        </FormField>
        <FormField label="Type" htmlFor={`${idPrefix}-type`}>
          <select
            id={`${idPrefix}-type`}
            className={FORM_SELECT_CLASS}
            value={values.typeId}
            onChange={(e) => {
              const nextTypeId = e.target.value
              const nextType = types.find((t) => t.id === nextTypeId)
              onChange({
                typeId: nextTypeId,
                ...(!nextType?.isPaid ? { hourlyRate: '' } : {}),
              })
            }}
            required
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isPaid ? ' ($)' : ''}
              </option>
            ))}
          </select>
        </FormField>
      </FormRow>
      {showLinkedUser || selectedTypeIsPaid ? (
        <FormRow>
          {showLinkedUser ? (
            <FormField label="Linked App User" htmlFor={`${idPrefix}-user`}>
              <select
                id={`${idPrefix}-user`}
                className={FORM_SELECT_CLASS}
                value={values.userId}
                onChange={(e) => onChange({ userId: e.target.value })}
              >
                <option value="">None — offline person</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          {selectedTypeIsPaid ? (
            <FormField
              label={values.rateType === 'DAILY' ? 'Daily Rate' : 'Hourly Rate'}
              htmlFor={`${idPrefix}-rate`}
            >
              <input
                id={`${idPrefix}-rate`}
                className={FORM_INPUT_CLASS}
                value={values.hourlyRate}
                onChange={(e) => onChange({ hourlyRate: e.target.value })}
                placeholder="e.g. 25"
                inputMode="decimal"
                required
              />
            </FormField>
          ) : null}
        </FormRow>
      ) : null}
      {selectedTypeIsPaid ? (
        <FormField label="Rate Type" htmlFor={`${idPrefix}-rate-type`}>
          <select
            id={`${idPrefix}-rate-type`}
            className={FORM_SELECT_CLASS}
            value={values.rateType}
            onChange={(e) =>
              onChange({ rateType: e.target.value as CareRateType })
            }
          >
            {RATE_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {values.rateType === 'DAILY' ? (
            <p className="mt-1 text-xs text-base-content/60">
              A flat amount per day — best for all-day coverage.
            </p>
          ) : null}
        </FormField>
      ) : null}
      {selectedTypeIsPaid && values.rateType === 'DAILY' ? (
        <FormField
          label="Pay full daily rate regardless of hours covered"
          htmlFor={`${idPrefix}-flat-daily`}
        >
          <input
            id={`${idPrefix}-flat-daily`}
            type="checkbox"
            className="toggle toggle-primary"
            checked={values.flatDailyRate}
            onChange={(e) => onChange({ flatDailyRate: e.target.checked })}
          />
          <p className="mt-1 text-xs text-base-content/60">
            When on, one-offs bill the full daily rate per day covered instead
            of pro-rating by hours worked.
          </p>
        </FormField>
      ) : null}
      {selectedTypeIsPaid ? (
        <>
          <FormField label="Typical schedule">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = values.standardDaysOfWeek.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    className={`btn btn-xs ${on ? 'btn-primary' : 'btn-ghost'}`}
                    aria-pressed={on}
                    onClick={() =>
                      onChange({
                        standardDaysOfWeek: on
                          ? values.standardDaysOfWeek.filter(
                              (v) => v !== d.value,
                            )
                          : [...values.standardDaysOfWeek, d.value].sort(
                              (a, b) => a - b,
                            ),
                      })
                    }
                  >
                    {d.label.slice(0, 3)}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-base-content/60">
              Days this person normally works. Used only to decide which rate
              applies — recurring assignment is still set up under Manage
              recurring on the calendar. Leave empty to bill everything at the
              standard rate.
            </p>
          </FormField>
          {values.standardDaysOfWeek.length > 0 ? (
            <>
              <FormRow>
                <FormField
                  label="Typical start"
                  htmlFor={`${idPrefix}-standard-start`}
                >
                  <input
                    id={`${idPrefix}-standard-start`}
                    type="time"
                    className={FORM_INPUT_CLASS}
                    value={values.standardStartTime}
                    onChange={(e) =>
                      onChange({ standardStartTime: e.target.value })
                    }
                  />
                </FormField>
                <FormField
                  label="Typical end"
                  htmlFor={`${idPrefix}-standard-end`}
                >
                  <input
                    id={`${idPrefix}-standard-end`}
                    type="time"
                    className={FORM_INPUT_CLASS}
                    value={values.standardEndTime}
                    onChange={(e) =>
                      onChange({ standardEndTime: e.target.value })
                    }
                  />
                </FormField>
              </FormRow>
              <p className="-mt-2 text-xs text-base-content/60">
                Leave both blank to treat the whole of a typical day as standard.
                An end at or before the start means an overnight window.
              </p>
              <FormField
                label="Off-schedule rate"
                htmlFor={`${idPrefix}-off-schedule-rate`}
              >
                <input
                  id={`${idPrefix}-off-schedule-rate`}
                  className={FORM_INPUT_CLASS}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={values.offScheduleRate}
                  onChange={(e) =>
                    onChange({ offScheduleRate: e.target.value })
                  }
                />
                <p className="mt-1 text-xs text-base-content/60">
                  Charged for work outside the typical schedule — for example
                  covering someone else&rsquo;s weekend. Same{' '}
                  {values.rateType === 'DAILY' ? 'per-day' : 'per-hour'} basis as
                  the standard rate. Leave blank for no premium.
                  {values.rateType === 'DAILY' && values.flatDailyRate
                    ? ' With a flat daily rate a whole day takes whichever rate covers more of it.'
                    : ' A shift crossing the boundary is split and each part billed at its own rate.'}
                </p>
              </FormField>
            </>
          ) : null}
          <FormRow>
            <FormField
              label="Pay Interval"
              htmlFor={`${idPrefix}-pay-interval`}
            >
              <select
                id={`${idPrefix}-pay-interval`}
                className={FORM_SELECT_CLASS}
                value={values.payInterval}
                onChange={(e) =>
                  onChange({
                    payInterval: e.target.value as CarePayInterval,
                  })
                }
              >
                {PAY_INTERVALS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>
            {values.payInterval === 'WEEKLY' ||
            values.payInterval === 'BIWEEKLY' ? (
              <FormField label="Pay Day" htmlFor={`${idPrefix}-pay-weekday`}>
                <select
                  id={`${idPrefix}-pay-weekday`}
                  className={FORM_SELECT_CLASS}
                  value={values.payWeekday}
                  onChange={(e) => onChange({ payWeekday: e.target.value })}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {values.payInterval === 'MONTHLY' ? (
              <FormField
                label="Pay Day of Month"
                htmlFor={`${idPrefix}-pay-month-day`}
              >
                <input
                  id={`${idPrefix}-pay-month-day`}
                  className={FORM_INPUT_CLASS}
                  type="number"
                  min={1}
                  max={28}
                  value={values.payMonthDay}
                  onChange={(e) => onChange({ payMonthDay: e.target.value })}
                  required
                />
              </FormField>
            ) : null}
          </FormRow>
          {values.payInterval === 'BIWEEKLY' ? (
            <FormField
              label="Pay Anchor Date (A Known Payday)"
              htmlFor={`${idPrefix}-pay-anchor`}
            >
              <input
                id={`${idPrefix}-pay-anchor`}
                className={FORM_INPUT_CLASS}
                type="date"
                value={values.payAnchorDate}
                onChange={(e) => onChange({ payAnchorDate: e.target.value })}
                required
              />
            </FormField>
          ) : null}
        </>
      ) : null}
      <FormRow>
        <ColorField
          id={`${idPrefix}-bg-color`}
          label="Background Color"
          value={values.bgColor}
          onBlur={() => {}}
          onChange={(bgColor) => onChange({ bgColor })}
        />
        <ColorField
          id={`${idPrefix}-text-color`}
          label="Text Color"
          value={values.textColor}
          onBlur={() => {}}
          onChange={(textColor) => onChange({ textColor })}
        />
      </FormRow>
      <FormField label="Active" htmlFor={`${idPrefix}-active`}>
        <input
          id={`${idPrefix}-active`}
          type="checkbox"
          className="toggle toggle-primary"
          checked={values.isActive}
          onChange={(e) => onChange({ isActive: e.target.checked })}
        />
      </FormField>
    </>
  )
}

export function carePersonFormPayload(values: CarePersonFormValues) {
  return {
    name: values.name,
    typeId: values.typeId,
    userId: values.userId,
    hourlyRate: values.hourlyRate,
    rateType: values.rateType,
    flatDailyRate: values.flatDailyRate,
    standardDaysOfWeek: values.standardDaysOfWeek,
    standardStartTime: values.standardStartTime,
    standardEndTime: values.standardEndTime,
    offScheduleRate: values.offScheduleRate,
    payInterval: values.payInterval,
    payWeekday: values.payWeekday,
    payAnchorDate: values.payAnchorDate,
    payMonthDay: values.payMonthDay,
    bgColor: values.bgColor,
    textColor: values.textColor,
    isActive: values.isActive,
  }
}
