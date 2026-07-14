import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import type { AccountType } from '#/generated/prisma/enums'
import type { AccountGroupListItem } from '#/server/accounts'
import {
  checkAccountNameAvailable,
  createAccount,
} from '#/server/accounts'
import { ACCOUNT_TYPE_OPTIONS } from './account-utils'

type GroupMode = 'none' | 'existing' | 'new'

type AddAccountFormValues = {
  name: string
  type: AccountType
  initialBalance: string
  isGlobal: boolean
  groupMode: GroupMode
  accountGroupId: string
  newGroup: {
    name: string
    isGlobal: boolean
  }
}

type AddAccountFormProps = {
  groups: AccountGroupListItem[]
}

function FieldError({
  id,
  errors,
}: {
  id: string
  errors: Array<string | undefined>
}) {
  const message = errors.filter(Boolean)[0]
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-sm text-error" role="alert">
      {message}
    </p>
  )
}

const defaultValues: AddAccountFormValues = {
  name: '',
  type: 'CHECKING',
  initialBalance: '0',
  isGlobal: false,
  groupMode: 'none',
  accountGroupId: '',
  newGroup: { name: '', isGlobal: false },
}

export function AddAccountForm({ groups }: AddAccountFormProps) {
  const navigate = useNavigate()

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await createAccount({ data: value })
      await navigate({ to: '/accounts' })
    },
  })

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-base-content">
            Add account
          </h2>
          <p className="mt-1 text-sm text-base-content/60">
            Create an account and optionally place it in a group.
          </p>
        </div>
        <Link to="/accounts" className="btn btn-ghost btn-sm">
          Cancel
        </Link>
      </div>

      <form
        className="flex flex-col gap-5 rounded-box bg-base-100 p-5 shadow-sm sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field
          name="name"
          asyncDebounceMs={400}
          validators={{
            onChange: ({ value }) =>
              value.trim() ? undefined : 'Account name is required.',
            onChangeAsync: async ({ value }) => {
              const trimmed = value.trim()
              if (!trimmed) return undefined
              const result = await checkAccountNameAvailable({
                data: { name: trimmed },
              })
              return result.available
                ? undefined
                : 'An account with this name already exists.'
            },
          }}
        >
          {(field) => {
            const errorId = `${field.name}-error`
            const hasError = field.state.meta.errors.length > 0
            return (
              <div>
                <label className="label" htmlFor={field.name}>
                  <span className="label-text font-medium">Name</span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  className="input input-bordered w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? errorId : undefined}
                  autoComplete="off"
                />
                {field.state.meta.isValidating ? (
                  <p className="mt-1 text-xs text-base-content/50">
                    Checking name…
                  </p>
                ) : null}
                <FieldError id={errorId} errors={field.state.meta.errors} />
              </div>
            )
          }}
        </form.Field>

        <form.Field
          name="type"
          validators={{
            onChange: ({ value }) =>
              value ? undefined : 'Choose an account type.',
          }}
        >
          {(field) => (
            <div>
              <label className="label" htmlFor={field.name}>
                <span className="label-text font-medium">Type</span>
              </label>
              <select
                id={field.name}
                name={field.name}
                className="select select-bordered w-full"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(event.target.value as AccountType)
                }
              >
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>

        <form.Field
          name="initialBalance"
          validators={{
            onChange: ({ value }) => {
              if (!value.trim()) return 'Opening balance is required.'
              return Number.isFinite(Number(value))
                ? undefined
                : 'Enter a valid number.'
            },
          }}
        >
          {(field) => {
            const errorId = `${field.name}-error`
            const hasError = field.state.meta.errors.length > 0
            return (
              <div>
                <label className="label" htmlFor={field.name}>
                  <span className="label-text font-medium">
                    Opening balance
                  </span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="number"
                  step="0.01"
                  className="input input-bordered w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? errorId : undefined}
                />
                <FieldError id={errorId} errors={field.state.meta.errors} />
              </div>
            )
          }}
        </form.Field>

        <form.Field name="isGlobal">
          {(field) => (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-box border border-base-200 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">
                  Show for all users
                </span>
                <span className="block text-xs text-base-content/60">
                  Visible to everyone using this self-hosted app.
                </span>
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.checked)}
                aria-label="Show account for all users"
              />
            </label>
          )}
        </form.Field>

        <form.Field name="groupMode">
          {(field) => (
            <fieldset>
              <legend className="label-text mb-2 font-medium">
                Account group
              </legend>
              <div className="flex flex-col gap-2">
                {(
                  [
                    { value: 'none', label: 'No group' },
                    {
                      value: 'existing',
                      label: 'Existing group',
                      disabled: groups.length === 0,
                    },
                    { value: 'new', label: 'Create new group' },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-3 text-sm"
                  >
                    <input
                      type="radio"
                      className="radio radio-primary radio-sm"
                      name={field.name}
                      value={option.value}
                      checked={field.state.value === option.value}
                      disabled={'disabled' in option ? option.disabled : false}
                      onBlur={field.handleBlur}
                      onChange={() => field.handleChange(option.value)}
                    />
                    {option.label}
                    {'disabled' in option && option.disabled
                      ? ' (none available)'
                      : null}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.groupMode}>
          {(groupMode) => (
            <>
              {groupMode === 'existing' ? (
                <form.Field
                  name="accountGroupId"
                  validators={{
                    onChange: ({ value, fieldApi }) => {
                      const mode = fieldApi.form.getFieldValue('groupMode')
                      if (mode !== 'existing') return undefined
                      return value ? undefined : 'Select an account group.'
                    },
                  }}
                >
                  {(field) => {
                    const errorId = `${field.name}-error`
                    const hasError = field.state.meta.errors.length > 0
                    return (
                      <div>
                        <label className="label" htmlFor={field.name}>
                          <span className="label-text font-medium">
                            Existing group
                          </span>
                        </label>
                        <select
                          id={field.name}
                          name={field.name}
                          className="select select-bordered w-full"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          aria-invalid={hasError}
                          aria-describedby={hasError ? errorId : undefined}
                        >
                          <option value="">Select a group</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                              {group.isGlobal ? ' (global)' : ''}
                            </option>
                          ))}
                        </select>
                        <FieldError
                          id={errorId}
                          errors={field.state.meta.errors}
                        />
                      </div>
                    )
                  }}
                </form.Field>
              ) : null}

              {groupMode === 'new' ? (
                <div className="flex flex-col gap-4 rounded-box border border-base-200 p-4">
                  <form.Field
                    name="newGroup.name"
                    validators={{
                      onChange: ({ value, fieldApi }) => {
                        const mode = fieldApi.form.getFieldValue('groupMode')
                        if (mode !== 'new') return undefined
                        return value.trim()
                          ? undefined
                          : 'New group name is required.'
                      },
                    }}
                  >
                    {(field) => {
                      const errorId = `${field.name}-error`
                      const hasError = field.state.meta.errors.length > 0
                      return (
                        <div>
                          <label className="label" htmlFor={field.name}>
                            <span className="label-text font-medium">
                              New group name
                            </span>
                          </label>
                          <input
                            id={field.name}
                            name={field.name}
                            className="input input-bordered w-full"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            aria-invalid={hasError}
                            aria-describedby={hasError ? errorId : undefined}
                            autoComplete="off"
                          />
                          <FieldError
                            id={errorId}
                            errors={field.state.meta.errors}
                          />
                        </div>
                      )
                    }}
                  </form.Field>

                  <form.Field name="newGroup.isGlobal">
                    {(field) => (
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="text-sm text-base-content/70">
                          Make group visible to all users
                        </span>
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.checked)
                          }
                          aria-label="Make group visible to all users"
                        />
                      </label>
                    )}
                  </form.Field>
                </div>
              ) : null}
            </>
          )}
        </form.Subscribe>

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <div className="flex flex-wrap justify-end gap-2 border-t border-base-200 pt-4">
              <Link to="/accounts" className="btn btn-ghost">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? 'Saving…' : 'Create account'}
              </button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}
