import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  FORM_INPUT_CLASS,
  FormActions,
  FormField,
  FormFieldError,
  FormShell,
} from '#/components/app/ui/form'
import type { AccountListItem } from '#/server/accounts'
import {
  checkAccountNameAvailable,
  updateAccount,
} from '#/server/accounts'
import { accountDetailSearchDefaults } from './account-detail-search'

type AccountSettingsFormProps = {
  account: AccountListItem
}

export function AccountSettingsForm({ account }: AccountSettingsFormProps) {
  const navigate = useNavigate()

  const form = useForm({
    defaultValues: {
      name: account.name,
      isGlobal: account.isGlobal,
    },
    onSubmit: async ({ value }) => {
      await updateAccount({
        data: {
          id: account.id,
          name: value.name,
          isGlobal: value.isGlobal,
        },
      })
      await navigate({
        to: '/accounts/$accountId',
        params: { accountId: account.id },
        search: accountDetailSearchDefaults,
      })
    },
  })

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-base-content">
            Account settings
          </h2>
          <p className="mt-1 text-sm text-base-content/60">
            Rename this account or change whether it is shared with all users.
          </p>
        </div>
        <Link
          to="/accounts/$accountId"
          params={{ accountId: account.id }}
          search={accountDetailSearchDefaults}
          className="btn btn-ghost btn-sm"
        >
          Cancel
        </Link>
      </div>

      <FormShell
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
              if (!trimmed || trimmed === account.name) return undefined
              const result = await checkAccountNameAvailable({
                data: { name: trimmed, excludeId: account.id },
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
              <FormField
                label="Name"
                htmlFor={field.name}
                hint={
                  field.state.meta.isValidating ? 'Checking name…' : undefined
                }
                error={
                  <FormFieldError
                    id={errorId}
                    errors={field.state.meta.errors}
                  />
                }
              >
                <input
                  id={field.name}
                  name={field.name}
                  className={FORM_INPUT_CLASS}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? errorId : undefined}
                  autoComplete="off"
                />
              </FormField>
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

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <FormActions>
              <Link
                to="/accounts/$accountId"
                params={{ accountId: account.id }}
                search={accountDetailSearchDefaults}
                className="btn btn-ghost"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? 'Saving…' : 'Save settings'}
              </button>
            </FormActions>
          )}
        </form.Subscribe>
      </FormShell>
    </div>
  )
}
