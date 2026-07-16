import { useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { TagSelectField } from '#/components/app/transactions/TagSelectField'
import { TaxonomySelectField } from '#/components/app/transactions/TaxonomySelectField'
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
import type { TransactionType } from '#/generated/prisma/enums'
import { sortByName, type ColoredTaxonomyRef } from '#/lib/taxonomy-types'
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
  payees: ColoredTaxonomyRef[]
  categories: ColoredTaxonomyRef[]
  tags: ColoredTaxonomyRef[]
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
          name="type"
          validators={{
            onChange: ({ value }) =>
              value ? undefined : 'Choose a transaction type.',
          }}
        >
          {(field) => (
            <FormField label="Type" htmlFor={field.name}>
              <select
                id={field.name}
                name={field.name}
                className={FORM_SELECT_CLASS}
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
            </FormField>
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
                  <FormField label="Effect on account" htmlFor={field.name}>
                    <select
                      id={field.name}
                      name={field.name}
                      className={FORM_SELECT_CLASS}
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
                  </FormField>
                )}
              </form.Field>
            ) : null
          }
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
                  hint="Enter a positive amount. Sign is applied from the type."
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

        <form.Field name="payeeId">
          {(field) => (
            <FormField label="Payee">
              <TaxonomySelectField
                title="Select payee"
                options={payeeOptions}
                value={field.state.value}
                onChange={field.handleChange}
                onRequestCreate={() => payeeDialogRef.current?.showModal()}
                createLabel="New payee"
                emptyLabel="No payees yet — create one to get started."
                placeholder="None — click to select"
              />
            </FormField>
          )}
        </form.Field>

        <form.Field name="categoryId">
          {(field) => (
            <FormField label="Category">
              <TaxonomySelectField
                title="Select category"
                options={categoryOptions}
                value={field.state.value}
                onChange={field.handleChange}
                onRequestCreate={() => categoryDialogRef.current?.showModal()}
                createLabel="New category"
                emptyLabel="No categories yet — create one to get started."
                placeholder="None — click to select"
              />
            </FormField>
          )}
        </form.Field>

        <form.Field name="tagIds">
          {(field) => (
            <FormField label="Tags">
              <TagSelectField
                options={tagOptions}
                value={field.state.value}
                onChange={field.handleChange}
                onRequestCreate={() => tagDialogRef.current?.showModal()}
              />
            </FormField>
          )}
        </form.Field>

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
            </FormActions>
          )}
        </form.Subscribe>
      </FormShell>

      <TaxonomyCreateDialog ref={payeeDialogRef} title="Add payee">
        <CreatePayeeForm
          dialogRef={payeeDialogRef}
          onCreated={(payee) => {
            setPayeeOptions((prev) =>
              sortByName(
                prev.some((item) => item.id === payee.id)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: payee.id,
                        name: payee.name,
                        bgColor: payee.bgColor,
                        textColor: payee.textColor,
                      },
                    ],
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
                  : [
                      ...prev,
                      {
                        id: category.id,
                        name: category.name,
                        bgColor: category.bgColor,
                        textColor: category.textColor,
                      },
                    ],
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
                  : [
                      ...prev,
                      {
                        id: tag.id,
                        name: tag.name,
                        bgColor: tag.bgColor,
                        textColor: tag.textColor,
                      },
                    ],
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
