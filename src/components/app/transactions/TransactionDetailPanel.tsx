import { useForm } from '@tanstack/react-form'
import { Link, useRouter } from '@tanstack/react-router'
import { useRef, useState, type ReactNode } from 'react'
import {
  HiOutlineDocument,
  HiOutlinePencil,
  HiOutlineSearch,
} from 'react-icons/hi'
import {
  AttachmentsZone,
  type AttachmentsZoneHandle,
} from '#/components/app/accounts/AttachmentsZone'
import {
  formatAccountCurrency,
  formatTransactionDate,
  transactionTypeLabel,
} from '#/components/app/accounts/account-utils'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import { CreateCategoryForm } from '#/components/app/accounts/CreateCategoryForm'
import { CreatePayeeForm } from '#/components/app/accounts/CreatePayeeForm'
import { CreateTagForm } from '#/components/app/accounts/CreateTagForm'
import { TaxonomyCreateDialog } from '#/components/app/accounts/TaxonomyCreateDialog'
import { TagSelectField } from '#/components/app/transactions/TagSelectField'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import {
  TaxonomyRectangle,
  TaxonomySelectField,
} from '#/components/app/transactions/TaxonomySelectField'
import { transactionsSearchDefaults } from '#/components/app/transactions/transactions-search'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FORM_TEXTAREA_CLASS,
  FormActions,
  FormField,
  FormFieldError,
} from '#/components/app/ui/form'
import { formatActivityAction } from '#/lib/activity'
import type { AttachmentListItem } from '#/lib/attachment-types'
import { sortByName, type ColoredTaxonomyRef } from '#/lib/taxonomy-types'
import {
  directionFromSignedAmount,
  magnitudeFromSignedAmount,
} from '#/lib/transaction-edit'
import {
  transactionTypeNeedsDirection,
  type TransactionDirection,
} from '#/lib/transaction-amount'
import type { ActivityDetail } from '#/server/activity'
import type { ActivityDisplayValue } from '#/server/activity-labels'
import {
  updateTransaction,
  type TransactionDetailDto,
} from '#/server/transactions'

type TransactionDetailPanelProps = {
  transaction: TransactionDetailDto
  activity: ActivityDetail[]
  payees: ColoredTaxonomyRef[]
  categories: ColoredTaxonomyRef[]
  tags: ColoredTaxonomyRef[]
}

type EditFormValues = {
  amount: string
  direction: TransactionDirection
  payeeId: string
  categoryId: string
  tagIds: string[]
  description: string
}

function DetailField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="app-form-field">
      <p className="app-form-label">{label}</p>
      <div className="min-h-10 text-base text-base-content">{children}</div>
    </div>
  )
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Renders one side of an audit change: colored badges for taxonomies, text otherwise. */
function ActivityValue({
  values,
  muted = false,
}: {
  values: ActivityDisplayValue[]
  muted?: boolean
}) {
  return (
    <span
      className={`flex flex-wrap items-center gap-1 ${
        muted ? 'opacity-60' : ''
      }`}
    >
      {values.map((value, index) =>
        value.kind === 'taxonomy' ? (
          <TaxonomyBadge
            key={index}
            name={value.name}
            bgColor={value.bgColor}
            textColor={value.textColor}
          />
        ) : (
          <span key={index} className="break-all">
            {value.text}
          </span>
        ),
      )}
    </span>
  )
}

function actorLabel(actor: ActivityDetail['actor']): string {
  if (!actor) return 'System'
  return actor.name?.trim() || actor.email?.trim() || 'User'
}

function DetailCard({
  title,
  children,
  actions,
  className = '',
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex h-full flex-col app-card p-5 sm:p-6 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-base-content">{title}</h3>
        {actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function AttachmentCard({ attachment }: { attachment: AttachmentListItem }) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const showThumb = attachment.thumbnailUrl !== null && !thumbFailed

  return (
    <a
      href={attachment.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group w-24"
      title={`Open ${attachment.fileName}`}
    >
      {showThumb ? (
        <img
          src={attachment.thumbnailUrl ?? undefined}
          alt={attachment.fileName}
          loading="lazy"
          onError={() => setThumbFailed(true)}
          className="h-24 w-24 rounded-box border border-base-300 bg-base-200/40 object-cover transition group-hover:border-primary"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-box border border-base-300 bg-base-200/40 transition group-hover:border-primary">
          <HiOutlineDocument
            className="size-8 text-base-content/40"
            aria-hidden
          />
        </div>
      )}
      <p className="mt-1 truncate text-xs font-medium group-hover:text-primary">
        {attachment.fileName}
      </p>
      <p className="text-xs text-base-content/50">
        {Math.max(1, Math.round(attachment.byteSize / 1024))} KB
      </p>
    </a>
  )
}

function TransactionActivitySection({
  transaction,
  activity,
}: {
  transaction: TransactionDetailDto
  activity: ActivityDetail[]
}) {
  return (
    <DetailCard title="Activity" className="lg:col-span-2">
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <DetailField label="Created">
          <span className="text-sm text-base-content/70">
            {formatWhen(transaction.createdAt)}
          </span>
        </DetailField>
        <DetailField label="Last modified">
          <span className="text-sm text-base-content/70">
            {formatWhen(transaction.updatedAt)}
          </span>
        </DetailField>
      </div>

      {activity.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No activity recorded for this transaction yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {activity.map((item) => {
            const changes = item.resolvedChanges ?? []
            return (
              <li
                key={item.id}
                className="rounded-lg border border-base-300 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-base-content">
                      {item.summary}
                    </p>
                    <p className="mt-0.5 text-xs text-base-content/60">
                      {formatActivityAction(item.action)} ·{' '}
                      {actorLabel(item.actor)} · {formatWhen(item.createdAt)}
                    </p>
                  </div>
                  <Link
                    to="/activity/$activityId"
                    params={{ activityId: item.id }}
                    className="btn btn-ghost btn-square btn-xs"
                    title="View audit details"
                    aria-label="View audit details"
                  >
                    <HiOutlineSearch className="size-3.5" aria-hidden />
                  </Link>
                </div>
                {changes.length > 0 ? (
                  <dl className="mt-3 space-y-2 border-t border-base-300 pt-3">
                    {changes.map((change) => (
                      <div
                        key={change.field}
                        className="grid gap-1 text-xs sm:grid-cols-[8rem_1fr]"
                      >
                        <dt className="font-medium text-base-content/60">
                          {change.label}
                        </dt>
                        <dd className="flex flex-wrap items-center gap-1.5 text-base-content/80">
                          <ActivityValue values={change.before} muted />
                          <span className="text-base-content/40">→</span>
                          <ActivityValue values={change.after} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </DetailCard>
  )
}

export function TransactionDetailPanel({
  transaction,
  activity,
  payees: initialPayees,
  categories: initialCategories,
  tags: initialTags,
}: TransactionDetailPanelProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)
  const [payeeOptions, setPayeeOptions] = useState(initialPayees)
  const [categoryOptions, setCategoryOptions] = useState(initialCategories)
  const [tagOptions, setTagOptions] = useState(initialTags)

  const payeeDialogRef = useRef<HTMLDialogElement>(null)
  const categoryDialogRef = useRef<HTMLDialogElement>(null)
  const tagDialogRef = useRef<HTMLDialogElement>(null)
  const attachmentsRef = useRef<AttachmentsZoneHandle>(null)

  const isTransfer = transaction.type === 'TRANSFER'
  const isReconciled = transaction.reconciliationStatus === 'RECONCILED'
  const amount = Number(transaction.amount)
  const amountTone =
    amount < 0 ? 'text-error' : amount > 0 ? 'text-success' : 'text-base-content'
  const needsDirection = transactionTypeNeedsDirection(transaction.type)

  const form = useForm({
    defaultValues: {
      amount: magnitudeFromSignedAmount(transaction.amount),
      direction: directionFromSignedAmount(transaction.amount),
      payeeId: transaction.payee?.id ?? '',
      categoryId: transaction.category?.id ?? '',
      tagIds: transaction.tags.map((tag) => tag.id),
      description: transaction.description ?? '',
    } satisfies EditFormValues,
    onSubmit: async ({ value }) => {
      setSubmitError(null)
      try {
        const uploaded = (await attachmentsRef.current?.uploadAll()) ?? []
        const keepAttachmentIds =
          attachmentsRef.current?.getKeepAttachmentIds() ??
          transaction.attachments.map((item) => item.id)

        await updateTransaction({
          data: {
            id: transaction.id,
            amount: value.amount,
            description: value.description,
            payee: isTransfer ? null : value.payeeId || null,
            category: isTransfer ? null : value.categoryId || null,
            tags: isTransfer ? [] : value.tagIds,
            keepAttachmentIds,
            attachments: uploaded,
            ...(needsDirection ? { direction: value.direction } : {}),
          },
        })
        await router.invalidate()
        setEditing(false)
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : 'Failed to update transaction.',
        )
      }
    },
  })

  function startEditing() {
    setSubmitError(null)
    form.reset({
      amount: magnitudeFromSignedAmount(transaction.amount),
      direction: directionFromSignedAmount(transaction.amount),
      payeeId: transaction.payee?.id ?? '',
      categoryId: transaction.category?.id ?? '',
      tagIds: transaction.tags.map((tag) => tag.id),
      description: transaction.description ?? '',
    })
    setEditing(true)
  }

  function cancelEditing() {
    setSubmitError(null)
    form.reset({
      amount: magnitudeFromSignedAmount(transaction.amount),
      direction: directionFromSignedAmount(transaction.amount),
      payeeId: transaction.payee?.id ?? '',
      categoryId: transaction.category?.id ?? '',
      tagIds: transaction.tags.map((tag) => tag.id),
      description: transaction.description ?? '',
    })
    setEditing(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-base-content">
            Transaction details
          </h2>
          <p className="text-sm text-base-content/60">
            {formatTransactionDate(transaction.date)} ·{' '}
            {transactionTypeLabel(transaction.type)}
            {transaction.reconciliationStatus !== 'UNCLEARED'
              ? ` · ${transaction.reconciliationStatus === 'CLEARED' ? 'Cleared' : transaction.reconciliationStatus === 'NEEDS_REVIEW' ? 'Needs review' : 'Reconciled'}`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && !isReconciled ? (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1.5"
              onClick={startEditing}
            >
              <HiOutlinePencil className="size-4" aria-hidden />
              Edit
            </button>
          ) : null}
          <Link
            to="/transactions"
            search={transactionsSearchDefaults}
            className="btn btn-ghost btn-sm"
          >
            All transactions
          </Link>
        </div>
      </div>

      {editing ? (
        <>
        <form
          className="grid gap-6 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <DetailCard title="Summary">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Date">
                {formatTransactionDate(transaction.date)}
              </DetailField>
              <DetailField label="Type">
                {transactionTypeLabel(transaction.type)}
              </DetailField>
              <form.Field
                name="amount"
                validators={{
                  onChange: ({ value }) => {
                    if (!value.trim()) return 'Amount is required.'
                    const parsed = Number(value)
                    if (!Number.isFinite(parsed)) return 'Enter a valid number.'
                    if (parsed <= 0) return 'Amount must be greater than zero.'
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
                      hint="Enter a positive amount. Sign follows the transaction type."
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
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={hasError}
                        aria-describedby={hasError ? errorId : undefined}
                      />
                    </FormField>
                  )
                }}
              </form.Field>
              <DetailField label="Account">
                <Link
                  to="/accounts/$accountId"
                  params={{ accountId: transaction.account.id }}
                  search={accountDetailSearchDefaults}
                  className="link link-hover font-medium"
                >
                  {transaction.account.name}
                  {transaction.account.isGlobal ? ' (Global)' : null}
                </Link>
              </DetailField>
              {needsDirection && !isTransfer ? (
                <form.Field name="direction">
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
              ) : null}
              <div className="sm:col-span-2">
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
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </FormField>
                  )}
                </form.Field>
              </div>
            </div>
          </DetailCard>

          {!isTransfer ? (
            <DetailCard title="Organizing">
              <div className="grid gap-4">
                <form.Field name="payeeId">
                  {(field) => (
                    <FormField label="Payee">
                      <TaxonomySelectField
                        title="Select payee"
                        options={payeeOptions}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onRequestCreate={() =>
                          payeeDialogRef.current?.showModal()
                        }
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
                        onRequestCreate={() =>
                          categoryDialogRef.current?.showModal()
                        }
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
              </div>
            </DetailCard>
          ) : null}

          <DetailCard title="Attachments" className="lg:col-span-2">
            <AttachmentsZone
              key={`attachments-${transaction.id}-${transaction.updatedAt}`}
              ref={attachmentsRef}
              existingAttachments={transaction.attachments}
              disabled={attachmentsUploading}
              onUploadingChange={setAttachmentsUploading}
            />
          </DetailCard>

          {submitError ? (
            <p className="text-sm text-error lg:col-span-2" role="alert">
              {submitError}
            </p>
          ) : null}

          <form.Subscribe
            selector={(state) =>
              [state.canSubmit, state.isSubmitting] as const
            }
          >
            {([canSubmit, isSubmitting]) => (
              <FormActions className="lg:col-span-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isSubmitting || attachmentsUploading}
                  onClick={cancelEditing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    !canSubmit || isSubmitting || attachmentsUploading
                  }
                >
                  {isSubmitting || attachmentsUploading
                    ? 'Saving…'
                    : 'Save changes'}
                </button>
              </FormActions>
            )}
          </form.Subscribe>
        </form>

          {/* Keep dialogs outside the edit form — nested forms are invalid HTML. */}
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
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <DetailCard title="Summary">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Date">
                {formatTransactionDate(transaction.date)}
              </DetailField>
              <DetailField label="Type">
                {transactionTypeLabel(transaction.type)}
              </DetailField>
              <DetailField label="Amount">
                <span className={`tabular-nums font-semibold ${amountTone}`}>
                  {formatAccountCurrency(transaction.amount)}
                </span>
              </DetailField>
              <DetailField label="Account">
                <Link
                  to="/accounts/$accountId"
                  params={{ accountId: transaction.account.id }}
                  search={accountDetailSearchDefaults}
                  className="link link-hover font-medium"
                >
                  {transaction.account.name}
                  {transaction.account.isGlobal ? ' (Global)' : null}
                </Link>
              </DetailField>
              <div className="sm:col-span-2">
                <DetailField label="Description">
                  {dash(transaction.description)}
                </DetailField>
              </div>
            </div>
          </DetailCard>

          {!isTransfer ? (
            <DetailCard title="Organizing">
              <div className="grid gap-4">
                <DetailField label="Payee">
                  <TaxonomyRectangle
                    selected={transaction.payee}
                    placeholder="—"
                  />
                </DetailField>
                <DetailField label="Category">
                  <TaxonomyRectangle
                    selected={transaction.category}
                    placeholder="—"
                  />
                </DetailField>
                <DetailField label="Tags">
                  {transaction.tags.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {transaction.tags.map((tag) => (
                        <TaxonomyBadge
                          key={tag.id}
                          size="lg"
                          name={tag.name}
                          bgColor={tag.bgColor}
                          textColor={tag.textColor}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-base-content/50">—</span>
                  )}
                </DetailField>
              </div>
            </DetailCard>
          ) : null}

          <DetailCard title="Attachments" className="lg:col-span-2">
            {transaction.attachments.length === 0 ? (
              <p className="text-sm text-base-content/60">No attachments.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {transaction.attachments.map((attachment) => (
                  <AttachmentCard
                    key={attachment.id}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}
          </DetailCard>

          {transaction.transferCounterpart ? (
            <DetailCard title="Transfer counterpart">
              <p className="text-sm text-base-content/70">
                {transaction.transferCounterpart.accountName} ·{' '}
                <span className="tabular-nums">
                  {formatAccountCurrency(
                    transaction.transferCounterpart.amount,
                  )}
                </span>
              </p>
              <Link
                to="/transactions/$transactionId"
                params={{
                  transactionId: transaction.transferCounterpart.id,
                }}
                className="link link-hover mt-2 inline-block text-sm font-medium"
              >
                View other side
              </Link>
            </DetailCard>
          ) : null}

          {transaction.careInvoice ? (
            <DetailCard title="Care invoice">
              <p className="text-sm text-base-content/70">
                This transaction settled a care invoice (
                {transaction.careInvoice.status}).
              </p>
              <Link
                to="/invoices"
                className="link link-hover mt-2 inline-block text-sm font-medium"
              >
                View invoices
              </Link>
            </DetailCard>
          ) : null}

          <TransactionActivitySection
            transaction={transaction}
            activity={activity}
          />
        </div>
      )}
    </div>
  )
}
