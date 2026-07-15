import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/** Default classes for primary form controls (roomy padding, full width). */
export const FORM_INPUT_CLASS =
  'input input-bordered min-h-12 w-full px-4'
export const FORM_SELECT_CLASS =
  'select select-bordered min-h-12 w-full border-base-300 bg-base-100 px-4 text-base-content'
export const FORM_TIME_INPUT_CLASS =
  'input input-bordered min-h-12 w-full pe-10 ps-4'
export const FORM_TEXTAREA_CLASS =
  'textarea textarea-bordered w-full px-4 py-3'

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type FormShellProps = ComponentPropsWithoutRef<'form'> & {
  /** When false, omit card surface (e.g. inside an existing modal). Default true. */
  card?: boolean
}

/**
 * Outer form wrapper: generous vertical gap between field groups.
 * Reference layout: labels above controls, actions bottom-right via FormActions.
 */
export function FormShell({
  className,
  card = true,
  children,
  ...props
}: FormShellProps) {
  return (
    <form
      className={cx(
        'app-form',
        card && 'rounded-box bg-base-100 p-5 shadow-sm sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </form>
  )
}

type FormFieldProps = {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

/** Label above control with ~8px gap; optional hint and error below. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cx('app-form-field', className)}>
      <label htmlFor={htmlFor} className="app-form-label">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-base-content/50">{hint}</p>
      ) : null}
      {error}
    </div>
  )
}

type FormRowProps = {
  children: ReactNode
  className?: string
  /** Column template; default two equal columns on sm+. */
  cols?: '2' | 'amount-method'
}

/** Side-by-side fields (e.g. amount + date). Stacks on small screens. */
export function FormRow({ children, className, cols = '2' }: FormRowProps) {
  return (
    <div
      className={cx(
        'grid gap-6',
        cols === '2' && 'sm:grid-cols-2',
        cols === 'amount-method' && 'sm:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

type FormActionsProps = {
  children: ReactNode
  className?: string
}

/** Bottom-right action row (Cancel + primary submit). */
export function FormActions({ children, className }: FormActionsProps) {
  return (
    <div className={cx('app-form-actions', className)}>{children}</div>
  )
}

type FormFieldErrorProps = {
  id?: string
  errors: Array<string | undefined>
}

export function FormFieldError({ id, errors }: FormFieldErrorProps) {
  const message = errors.filter(Boolean)[0]
  if (!message) return null
  return (
    <p id={id} className="text-sm text-error" role="alert">
      {message}
    </p>
  )
}
