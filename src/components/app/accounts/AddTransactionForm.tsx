import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import type { TransactionType } from '#/generated/prisma/enums'
import type { AccountListItem } from '#/server/accounts'
import { createTransaction } from '#/server/transactions'
import {
  defaultDirectionForType,
  transactionTypeNeedsDirection,
  type TransactionDirection,
} from '#/lib/transaction-amount'
import { accountDetailSearchDefaults } from './account-detail-search'
import {
  TRANSACTION_TYPE_OPTIONS,
  todayDateInputValue,
} from './account-utils'

type AddTransactionFormValues = {
  type: TransactionType
  direction: TransactionDirection
  amount: string
  date: string
  description: string
}

type AddTransactionFormProps = {
  account: AccountListItem
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

export function AddTransactionForm({ account }: AddTransactionFormProps) {
  const navigate = useNavigate()

  const defaultValues: AddTransactionFormValues = {
    type: 'EXPENSE',
    direction: 'out',
    amount: '',
    date: todayDateInputValue(),
    description: '',
  }

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await createTransaction({
        data: {
          financialAccountId: account.id,
          type: value.type,
          amount: value.amount,
          date: value.date,
          description: value.description,
          ...(transactionTypeNeedsDirection(value.type)
            ? { direction: value.direction }
            : {}),
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
            Add transaction
          </h2>
          <p className="mt-1 text-sm text-base-content/60">
            Recording against <span className="font-medium">{account.name}</span>
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

      <form
        className="flex flex-col gap-5 rounded-box bg-base-100 p-5 shadow-sm sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field
          name="type"
          validators={{
            onChange: ({ value }) =>
              value ? undefined : 'Choose a transaction type.',
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
                onChange={(event) => {
                  const nextType = event.target.value as TransactionType
                  field.handleChange(nextType)
                  if (transactionTypeNeedsDirection(nextType)) {
                    form.setFieldValue(
                      'direction',
                      defaultDirectionForType(nextType),
                    )
                  }
                }}
              >
                {TRANSACTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.type}>
          {(type) =>
            transactionTypeNeedsDirection(type) ? (
              <form.Field
                name="direction"
                validators={{
                  onChange: ({ value }) =>
                    value === 'in' || value === 'out'
                      ? undefined
                      : 'Choose a direction.',
                }}
              >
                {(field) => (
                  <div>
                    <label className="label" htmlFor={field.name}>
                      <span className="label-text font-medium">
                        Effect on account
                      </span>
                    </label>
                    <select
                      id={field.name}
                      name={field.name}
                      className="select select-bordered w-full"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value as TransactionDirection,
                        )
                      }
                    >
                      <option value="in">In (increases balance)</option>
                      <option value="out">Out (decreases balance)</option>
                    </select>
                  </div>
                )}
              </form.Field>
            ) : null
          }
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
                <p className="mt-1 text-xs text-base-content/50">
                  Enter a positive amount. Sign is applied from the type.
                </p>
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

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <div className="flex flex-wrap justify-end gap-2 border-t border-base-200 pt-4">
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
                {isSubmitting ? 'Saving…' : 'Create transaction'}
              </button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}
