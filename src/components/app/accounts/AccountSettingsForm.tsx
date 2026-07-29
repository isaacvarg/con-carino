import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/app/ui/confirm-dialog'
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
  removeAccount,
  updateAccount,
} from '#/server/accounts'
import { transactionsSearchDefaults } from '#/components/app/transactions/transactions-search'
import { accountDetailSearchDefaults } from './account-detail-search'

type AccountSettingsFormProps = {
  account: AccountListItem
}

export function AccountSettingsForm({ account }: AccountSettingsFormProps) {
  const navigate = useNavigate()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function confirmRemove() {
    setRemoving(true)
    setRemoveError(null)
    try {
      await removeAccount({ data: { id: account.id } })
      setConfirmingRemove(false)
      // The account is gone or hidden either way, so its routes no longer resolve.
      await navigate({ to: '/transactions', search: transactionsSearchDefaults })
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : 'Could not remove the account.',
      )
      setConfirmingRemove(false)
    } finally {
      setRemoving(false)
    }
  }

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
      <div className="mb-4 flex items-center justify-end gap-3">
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

      <div className="mt-6 rounded-box border border-error/30 p-4">
        <h3 className="font-semibold text-base-content">Remove this account</h3>
        <p className="mt-1 text-sm text-base-content/60">
          An account with no transactions is deleted outright. One with history
          can only be archived, which an admin has to do.
        </p>
        {removeError ? (
          <p className="mt-2 text-sm text-error" role="alert">
            {removeError}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-outline btn-error btn-sm mt-3"
          onClick={() => setConfirmingRemove(true)}
        >
          Remove account
        </button>
      </div>

      <ConfirmDialog
        open={confirmingRemove}
        title={`Remove “${account.name}”?`}
        message="If it has no transactions it will be deleted permanently. If it has history, it will be archived instead — nothing is lost, but it disappears from your account list."
        confirmLabel="Remove"
        busy={removing}
        tone="danger"
        onConfirm={() => void confirmRemove()}
        onCancel={() => setConfirmingRemove(false)}
      />
    </div>
  )
}
