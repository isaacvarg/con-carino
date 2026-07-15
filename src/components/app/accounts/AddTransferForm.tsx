import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FORM_TEXTAREA_CLASS,
  FormActions,
  FormField,
  FormFieldError,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
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
      <div className="mb-4 flex items-center justify-end gap-3">
        <Link
          to="/accounts/$accountId"
          params={{ accountId: returnAccountId }}
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
                    <FormField
                      label="From"
                      htmlFor={field.name}
                      hint="Withdrawal (−) from this account."
                      error={
                        <FormFieldError
                          id={errorId}
                          errors={field.state.meta.errors}
                        />
                      }
                    >
                      <select
                        id={field.name}
                        name={field.name}
                        className={FORM_SELECT_CLASS}
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
                    </FormField>
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
                    <FormField
                      label="To"
                      htmlFor={field.name}
                      hint="Deposit (+) into this account."
                      error={
                        <FormFieldError
                          id={errorId}
                          errors={field.state.meta.errors}
                        />
                      }
                    >
                      <select
                        id={field.name}
                        name={field.name}
                        className={FORM_SELECT_CLASS}
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
                    </FormField>
                  )
                }}
              </form.Field>
            </>
          )}
        </form.Subscribe>

        <FormRow>
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
                <FormField
                  label="Amount"
                  htmlFor={field.name}
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
                    type="number"
                    step="0.01"
                    min="0.01"
                    className={FORM_INPUT_CLASS}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? errorId : undefined}
                  />
                </FormField>
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
                <FormField
                  label="Date"
                  htmlFor={field.name}
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
                    type="date"
                    className={FORM_INPUT_CLASS}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? errorId : undefined}
                  />
                </FormField>
              )
            }}
          </form.Field>
        </FormRow>

        <form.Field name="description">
          {(field) => (
            <FormField label="Description" htmlFor={field.name}>
              <textarea
                id={field.name}
                name={field.name}
                className={FORM_TEXTAREA_CLASS}
                rows={3}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </FormField>
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
            <FormActions>
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
            </FormActions>
          )}
        </form.Subscribe>
      </FormShell>
    </div>
  )
}
