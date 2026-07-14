import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { AccountListItem } from '#/server/accounts'
import { createTransfer } from '#/server/transactions'
import { accountDetailSearchDefaults } from './account-detail-search'
import { todayDateInputValue } from './account-utils'
import {
  AttachmentsZone,
  type AttachmentsZoneHandle,
} from './AttachmentsZone'

type AddTransferFormValues = {
  fromAccountId: string
  toAccountId: string
  amount: string
  date: string
  description: string
}

type AddTransferFormProps = {
  /** Account page the user started from (navigation target after save). */
  returnAccountId: string
  accounts: AccountListItem[]
  defaultFromAccountId: string
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

function accountOptionLabel(account: AccountListItem): string {
  return account.isGlobal ? `${account.name} (Global)` : account.name
}

export function AddTransferForm({
  returnAccountId,
  accounts,
  defaultFromAccountId,
}: AddTransferFormProps) {
  const navigate = useNavigate()
  const attachmentsRef = useRef<AttachmentsZoneHandle>(null)
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)

  const defaultToAccountId =
    accounts.find((account) => account.id !== defaultFromAccountId)?.id ?? ''

  const defaultValues: AddTransferFormValues = {
    fromAccountId: defaultFromAccountId,
    toAccountId: defaultToAccountId,
    amount: '',
    date: todayDateInputValue(),
    description: '',
  }

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const attachments = await attachmentsRef.current?.uploadAll()
      await createTransfer({
        data: {
          fromAccountId: value.fromAccountId,
          toAccountId: value.toAccountId,
          amount: value.amount,
          date: value.date,
          description: value.description,
          attachments: attachments ?? [],
        },
      })
      await navigate({
        to: '/accounts/$accountId',
        params: { accountId: returnAccountId },
        search: accountDetailSearchDefaults,
      })
    },
  })

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Transfer</h2>
          <p className="mt-1 text-sm text-base-content/60">
            Move money between accounts. From is a withdrawal; To is a deposit.
          </p>
        </div>
        <Link
          to="/accounts/$accountId"
          params={{ accountId: returnAccountId }}
          search={accountDetailSearchDefaults}
          className="btn btn-ghost btn-sm"
        >
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
        <form.Subscribe selector={(state) => state.values.fromAccountId}>
          {(fromAccountId) => (
            <>
              <form.Field
                name="fromAccountId"
                validators={{
                  onChange: ({ value }) =>
                    value ? undefined : 'Choose a from account.',
                }}
              >
                {(field) => {
                  const errorId = `${field.name}-error`
                  const hasError = field.state.meta.errors.length > 0
                  return (
                    <div>
                      <label className="label" htmlFor={field.name}>
                        <span className="label-text font-medium">From</span>
                      </label>
                      <select
                        id={field.name}
                        name={field.name}
                        className="select select-bordered w-full"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          const nextFrom = event.target.value
                          field.handleChange(nextFrom)
                          if (form.getFieldValue('toAccountId') === nextFrom) {
                            const fallback = accounts.find(
                              (account) => account.id !== nextFrom,
                            )?.id
                            form.setFieldValue('toAccountId', fallback ?? '')
                          }
                        }}
                        aria-invalid={hasError}
                        aria-describedby={hasError ? errorId : undefined}
                      >
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {accountOptionLabel(account)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-base-content/50">
                        Withdrawal (−) from this account.
                      </p>
                      <FieldError
                        id={errorId}
                        errors={field.state.meta.errors}
                      />
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="toAccountId"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return 'Choose a to account.'
                    if (value === fromAccountId) {
                      return 'To account must be different from From.'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => {
                  const errorId = `${field.name}-error`
                  const hasError = field.state.meta.errors.length > 0
                  const toOptions = accounts.filter(
                    (account) => account.id !== fromAccountId,
                  )
                  return (
                    <div>
                      <label className="label" htmlFor={field.name}>
                        <span className="label-text font-medium">To</span>
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
                        {toOptions.length === 0 ? (
                          <option value="">No other accounts available</option>
                        ) : (
                          toOptions.map((account) => (
                            <option key={account.id} value={account.id}>
                              {accountOptionLabel(account)}
                            </option>
                          ))
                        )}
                      </select>
                      <p className="mt-1 text-xs text-base-content/50">
                        Deposit (+) into this account.
                      </p>
                      <FieldError
                        id={errorId}
                        errors={field.state.meta.errors}
                      />
                    </div>
                  )
                }}
              </form.Field>
            </>
          )}
        </form.Subscribe>

        <form.Field
          name="amount"
          validators={{
            onChange: ({ value }) => {
              if (!value.trim()) return 'Amount is required.'
              const amount = Number(value)
              if (!Number.isFinite(amount)) return 'Enter a valid number.'
              if (amount <= 0) return 'Amount must be greater than zero.'
              return undefined
            },
          }}
        >
          {(field) => {
            const errorId = `${field.name}-error`
            const hasError = field.state.meta.errors.length > 0
            return (
              <div>
                <label className="label" htmlFor={field.name}>
                  <span className="label-text font-medium">Amount</span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="number"
                  step="0.01"
                  min="0.01"
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

        <form.Field
          name="date"
          validators={{
            onChange: ({ value }) =>
              value.trim() ? undefined : 'Date is required.',
          }}
        >
          {(field) => {
            const errorId = `${field.name}-error`
            const hasError = field.state.meta.errors.length > 0
            return (
              <div>
                <label className="label" htmlFor={field.name}>
                  <span className="label-text font-medium">Date</span>
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="date"
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

        <form.Field name="description">
          {(field) => (
            <div>
              <label className="label" htmlFor={field.name}>
                <span className="label-text font-medium">Description</span>
              </label>
              <textarea
                id={field.name}
                name={field.name}
                className="textarea textarea-bordered w-full"
                rows={3}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>

        <AttachmentsZone
          ref={attachmentsRef}
          disabled={attachmentsUploading}
          onUploadingChange={setAttachmentsUploading}
        />

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <div className="flex flex-wrap justify-end gap-2 border-t border-base-200 pt-4">
              <Link
                to="/accounts/$accountId"
                params={{ accountId: returnAccountId }}
                search={accountDetailSearchDefaults}
                className="btn btn-ghost"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting || attachmentsUploading}
              >
                {isSubmitting || attachmentsUploading
                  ? 'Transferring…'
                  : 'Create transfer'}
              </button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}
