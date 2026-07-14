import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { HiPlus } from 'react-icons/hi'
import type { TransactionType } from '#/generated/prisma/enums'
import type { TaxonomyListItem } from '#/lib/taxonomy-types'
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
import {
  AttachmentsZone,
  type AttachmentsZoneHandle,
} from './AttachmentsZone'
import { CreateCategoryForm } from './CreateCategoryForm'
import { CreatePayeeForm } from './CreatePayeeForm'
import { CreateTagForm } from './CreateTagForm'
import { TaxonomyCreateDialog } from './TaxonomyCreateDialog'

type AddTransactionFormValues = {
  type: TransactionType
  direction: TransactionDirection
  amount: string
  date: string
  payeeId: string
  categoryId: string
  tagIds: string[]
  description: string
}

type AddTransactionFormProps = {
  account: AccountListItem
  payees: TaxonomyListItem[]
  categories: TaxonomyListItem[]
  tags: TaxonomyListItem[]
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

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

export function AddTransactionForm({
  account,
  payees: initialPayees,
  categories: initialCategories,
  tags: initialTags,
}: AddTransactionFormProps) {
  const navigate = useNavigate()
  const payeeDialogRef = useRef<HTMLDialogElement>(null)
  const categoryDialogRef = useRef<HTMLDialogElement>(null)
  const tagDialogRef = useRef<HTMLDialogElement>(null)
  const attachmentsRef = useRef<AttachmentsZoneHandle>(null)
  const [payeeOptions, setPayeeOptions] = useState(initialPayees)
  const [categoryOptions, setCategoryOptions] = useState(initialCategories)
  const [tagOptions, setTagOptions] = useState(initialTags)
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)

  const defaultValues: AddTransactionFormValues = {
    type: 'EXPENSE',
    direction: 'out',
    amount: '',
    date: todayDateInputValue(),
    payeeId: '',
    categoryId: '',
    tagIds: [],
    description: '',
  }

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const attachments = await attachmentsRef.current?.uploadAll()
      await createTransaction({
        data: {
          financialAccountId: account.id,
          type: value.type,
          amount: value.amount,
          date: value.date,
          description: value.description,
          payee: value.payeeId || null,
          category: value.categoryId || null,
          tags: value.tagIds,
          attachments: attachments ?? [],
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

        <form.Field name="payeeId">
          {(field) => (
            <div>
              <label className="label" htmlFor={field.name}>
                <span className="label-text font-medium">Payee</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  id={field.name}
                  name={field.name}
                  className="select select-bordered min-w-0 flex-1"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  <option value="">None</option>
                  {payeeOptions.map((payee) => (
                    <option key={payee.id} value={payee.id}>
                      {payee.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-square btn-outline"
                  aria-label="Add payee"
                  onClick={() => payeeDialogRef.current?.showModal()}
                >
                  <HiPlus className="size-5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </form.Field>

        <form.Field name="categoryId">
          {(field) => (
            <div>
              <label className="label" htmlFor={field.name}>
                <span className="label-text font-medium">Category</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  id={field.name}
                  name={field.name}
                  className="select select-bordered min-w-0 flex-1"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  <option value="">None</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-square btn-outline"
                  aria-label="Add category"
                  onClick={() => categoryDialogRef.current?.showModal()}
                >
                  <HiPlus className="size-5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </form.Field>

        <form.Field name="tagIds">
          {(field) => (
            <div>
              <label className="label" htmlFor={field.name}>
                <span className="label-text font-medium">Tags</span>
              </label>
              <div className="flex items-start gap-2">
                <select
                  id={field.name}
                  name={field.name}
                  className="select select-bordered h-auto min-h-24 min-w-0 flex-1 py-2"
                  multiple
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    const selected = Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    )
                    field.handleChange(selected)
                  }}
                >
                  {tagOptions.length === 0 ? (
                    <option value="" disabled>
                      No tags yet — use + to add
                    </option>
                  ) : (
                    tagOptions.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="btn btn-square btn-outline"
                  aria-label="Add tag"
                  onClick={() => tagDialogRef.current?.showModal()}
                >
                  <HiPlus className="size-5" aria-hidden />
                </button>
              </div>
              <p className="mt-1 text-xs text-base-content/50">
                Hold Ctrl/Cmd to select multiple tags.
              </p>
            </div>
          )}
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
                params={{ accountId: account.id }}
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
                  ? 'Saving…'
                  : 'Create transaction'}
              </button>
            </div>
          )}
        </form.Subscribe>
      </form>

      <TaxonomyCreateDialog ref={payeeDialogRef} title="Add payee">
        <CreatePayeeForm
          dialogRef={payeeDialogRef}
          onCreated={(payee) => {
            setPayeeOptions((prev) =>
              sortByName(
                prev.some((item) => item.id === payee.id)
                  ? prev
                  : [...prev, { id: payee.id, name: payee.name }],
              ),
            )
            form.setFieldValue('payeeId', payee.id)
          }}
        />
      </TaxonomyCreateDialog>

      <TaxonomyCreateDialog ref={categoryDialogRef} title="Add category">
        <CreateCategoryForm
          dialogRef={categoryDialogRef}
          onCreated={(category) => {
            setCategoryOptions((prev) =>
              sortByName(
                prev.some((item) => item.id === category.id)
                  ? prev
                  : [...prev, { id: category.id, name: category.name }],
              ),
            )
            form.setFieldValue('categoryId', category.id)
          }}
        />
      </TaxonomyCreateDialog>

      <TaxonomyCreateDialog ref={tagDialogRef} title="Add tag">
        <CreateTagForm
          dialogRef={tagDialogRef}
          onCreated={(tag) => {
            setTagOptions((prev) =>
              sortByName(
                prev.some((item) => item.id === tag.id)
                  ? prev
                  : [...prev, { id: tag.id, name: tag.name }],
              ),
            )
            const current = form.getFieldValue('tagIds')
            if (!current.includes(tag.id)) {
              form.setFieldValue('tagIds', [...current, tag.id])
            }
          }}
        />
      </TaxonomyCreateDialog>
    </div>
  )
}
