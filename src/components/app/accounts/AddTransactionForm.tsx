import { useForm } from '@tanstack/react-form'
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { TagSelectField } from '#/components/app/transactions/TagSelectField'
import { WeekSelectField } from '#/components/app/transactions/WeekSelectField'
import { TaxonomySelectField } from '#/components/app/transactions/TaxonomySelectField'
import { transactionsSearchDefaults } from '#/components/app/transactions/transactions-search'
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
import { sortByName, type ColoredTaxonomyRef } from '#/lib/taxonomy-types'
import { fromYmd, weekStartYmd } from '#/lib/week-start'
import type { AccountListItem } from '#/server/accounts'
import { createTransaction } from '#/server/transactions'
import {
  defaultDirectionForType,
  findTransactionType,
  transactionTypeOptions,
  typeNeedsDirection,
  type TransactionDirection,
} from '#/lib/transaction-types'
import { accountDetailSearchDefaults } from './account-detail-search'
import { todayDateInputValue } from './account-utils'
import {
  AttachmentsZone,
  type AttachmentsZoneHandle,
} from './AttachmentsZone'
import { CreateCategoryForm } from './CreateCategoryForm'
import { CreatePayeeForm } from './CreatePayeeForm'
import { CreateTagForm } from './CreateTagForm'
import { TaxonomyCreateDialog } from './TaxonomyCreateDialog'

type AddTransactionFormValues = {
  financialAccountId: string
  typeId: string
  direction: TransactionDirection
  amount: string
  date: string
  payeeId: string
  categoryId: string
  tagIds: string[]
  weekStart: string
  description: string
}

type AddTransactionFormShared = {
  payees: ColoredTaxonomyRef[]
  categories: ColoredTaxonomyRef[]
  tags: ColoredTaxonomyRef[]
}

export type AddTransactionFormProps = AddTransactionFormShared &
  (
    | { account: AccountListItem; accounts?: undefined }
    | {
        account?: undefined
        accounts: AccountListItem[]
        defaultAccountId?: string
      }
  )

function accountOptionLabel(account: AccountListItem): string {
  return account.isGlobal ? `${account.name} (Global)` : account.name
}

function CancelLink({
  accountId,
}: {
  accountId: string | null
}) {
  if (accountId) {
    return (
      <Link
        to="/accounts/$accountId"
        params={{ accountId }}
        search={accountDetailSearchDefaults}
        className="btn btn-ghost btn-sm"
      >
        Cancel
      </Link>
    )
  }

  return (
    <Link
      to="/transactions"
      search={transactionsSearchDefaults}
      className="btn btn-ghost btn-sm"
    >
      Cancel
    </Link>
  )
}

function CancelAction({
  accountId,
}: {
  accountId: string | null
}) {
  if (accountId) {
    return (
      <Link
        to="/accounts/$accountId"
        params={{ accountId }}
        search={accountDetailSearchDefaults}
        className="btn btn-ghost"
      >
        Cancel
      </Link>
    )
  }

  return (
    <Link
      to="/transactions"
      search={transactionsSearchDefaults}
      className="btn btn-ghost"
    >
      Cancel
    </Link>
  )
}

export function AddTransactionForm(props: AddTransactionFormProps) {
  const { payees: initialPayees, categories: initialCategories, tags: initialTags } =
    props
  const isGlobal = props.accounts !== undefined
  const accounts = isGlobal ? props.accounts : undefined
  const lockedAccount = !isGlobal ? props.account : undefined
  const returnAccountId = lockedAccount?.id ?? null
  const defaultAccountId =
    lockedAccount?.id ??
    (isGlobal
      ? (props.defaultAccountId ?? accounts?.[0]?.id ?? '')
      : '')

  const navigate = useNavigate()
  const payeeDialogRef = useRef<HTMLDialogElement>(null)
  const categoryDialogRef = useRef<HTMLDialogElement>(null)
  const tagDialogRef = useRef<HTMLDialogElement>(null)
  const attachmentsRef = useRef<AttachmentsZoneHandle>(null)
  const [payeeOptions, setPayeeOptions] = useState(initialPayees)
  const [categoryOptions, setCategoryOptions] = useState(initialCategories)
  const [tagOptions, setTagOptions] = useState(initialTags)
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)

  const { transactionTypes, weekStartsOn } = useRouteContext({ from: '/_app' })
  const typeOptions = transactionTypeOptions(transactionTypes)

  // Once the week has been set by hand, the date stops driving it. Without this
  // flag, clearing the week would silently refill on the next date edit.
  const weekTouched = useRef(false)

  function directionNeededFor(typeId: string): boolean {
    const type = findTransactionType(transactionTypes, typeId)
    return type ? typeNeedsDirection(type) : false
  }

  const defaultValues: AddTransactionFormValues = {
    financialAccountId: defaultAccountId,
    // Whatever the admin ordered first, rather than a hardcoded Expense: the
    // list is theirs to arrange now.
    typeId: typeOptions[0]?.id ?? '',
    direction: 'out',
    amount: '',
    date: todayDateInputValue(),
    payeeId: '',
    categoryId: '',
    tagIds: [],
    weekStart: weekStartYmd(new Date(), weekStartsOn),
    description: '',
  }

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const attachments = await attachmentsRef.current?.uploadAll()
      await createTransaction({
        data: {
          financialAccountId: value.financialAccountId,
          typeId: value.typeId,
          amount: value.amount,
          date: value.date,
          description: value.description,
          payee: value.payeeId || null,
          category: value.categoryId || null,
          tags: value.tagIds,
          weekStart: value.weekStart || null,
          attachments: attachments ?? [],
          ...(directionNeededFor(value.typeId)
            ? { direction: value.direction }
            : {}),
        },
      })
      if (returnAccountId) {
        await navigate({
          to: '/accounts/$accountId',
          params: { accountId: returnAccountId },
          search: accountDetailSearchDefaults,
        })
      } else {
        await navigate({
          to: '/transactions',
          search: transactionsSearchDefaults,
        })
      }
    },
  })

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4 flex items-center justify-end gap-3">
        <CancelLink accountId={returnAccountId} />
      </div>

      <FormShell
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        {isGlobal && accounts ? (
          <form.Field
            name="financialAccountId"
            validators={{
              onChange: ({ value }) =>
                value ? undefined : 'Choose an account.',
            }}
          >
            {(field) => {
              const errorId = `${field.name}-error`
              const hasError = field.state.meta.errors.length > 0
              return (
                <FormField
                  label="Account"
                  htmlFor={field.name}
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
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? errorId : undefined}
                  >
                    {accounts.length === 0 ? (
                      <option value="">No accounts available</option>
                    ) : (
                      accounts.map((account) => (
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
        ) : null}

        <form.Field
          name="typeId"
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
                  const nextTypeId = event.target.value
                  field.handleChange(nextTypeId)
                  const nextType = findTransactionType(
                    transactionTypes,
                    nextTypeId,
                  )
                  if (nextType && typeNeedsDirection(nextType)) {
                    form.setFieldValue(
                      'direction',
                      defaultDirectionForType(nextType),
                    )
                  }
                }}
              >
                {typeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.typeId}>
          {(typeId) =>
            directionNeededFor(typeId) ? (
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
                    onChange={(event) => {
                      const nextDate = event.target.value
                      field.handleChange(nextDate)
                      // The week follows the date until the user takes it over.
                      if (weekTouched.current) return
                      const parsed = fromYmd(nextDate)
                      form.setFieldValue(
                        'weekStart',
                        parsed ? weekStartYmd(parsed, weekStartsOn) : '',
                      )
                    }}
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

        <form.Subscribe selector={(state) => state.values.date}>
          {(date) => (
            <form.Field name="weekStart">
              {(field) => (
                <FormField
                  label="Week"
                  htmlFor={field.name}
                  hint="Optional. Only for your own organizing — nothing depends on it."
                >
                  <WeekSelectField
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(next) => {
                      weekTouched.current = true
                      field.handleChange(next)
                    }}
                    anchorDate={date}
                    weekStartsOn={weekStartsOn}
                  />
                </FormField>
              )}
            </form.Field>
          )}
        </form.Subscribe>

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
              <CancelAction accountId={returnAccountId} />
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
