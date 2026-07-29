import { useMemo } from 'react'
import { FORM_SELECT_CLASS } from '#/components/app/ui/form'
import {
  fromYmd,
  weekOptionsAround,
  type WeekStart,
} from '#/lib/week-start'

/** Weeks offered on either side of the anchor date — a year in each direction. */
const WEEKS_AROUND = 52

type WeekSelectFieldProps = {
  id: string
  name: string
  /** Stored `YYYY-MM-DD` of the week's first day, or '' for unfiled. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** The transaction's date; the option list is centred on its week. */
  anchorDate: string
  weekStartsOn: WeekStart
  disabled?: boolean
  /** Override for compact contexts like the reconciliation queue. */
  className?: string
}

/**
 * Optional week picker. Unrelated to tags — this is a plain scalar on the
 * transaction, offered as a flat list of date ranges.
 *
 * The current value is always present in the list even when it falls outside the
 * window or was filed under the other week anchor, so switching the household
 * setting can never strand a transaction on a week you cannot re-select.
 */
export function WeekSelectField({
  id,
  name,
  value,
  onChange,
  onBlur,
  anchorDate,
  weekStartsOn,
  disabled = false,
  className = FORM_SELECT_CLASS,
}: WeekSelectFieldProps) {
  const options = useMemo(() => {
    const anchor = fromYmd(anchorDate) ?? new Date()
    return weekOptionsAround(
      anchor,
      weekStartsOn,
      WEEKS_AROUND,
      WEEKS_AROUND,
      value || null,
    )
  }, [anchorDate, weekStartsOn, value])

  return (
    <select
      id={id}
      name={name}
      className={className}
      value={value}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">— None —</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
