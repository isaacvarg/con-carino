import { useNavigate, useRouter } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  HiCheck,
  HiOutlineExclamation,
  HiOutlineSearch,
  HiX,
} from 'react-icons/hi'
import { CreatePayeeForm } from '#/components/app/accounts/CreatePayeeForm'
import {
  formatAccountCurrency,
  formatTransactionDate,
} from '#/components/app/accounts/account-utils'
import type { AccountTransactionsSearch } from '#/components/app/accounts/account-detail-search'
import { TaxonomySelectField } from '#/components/app/transactions/TaxonomySelectField'
import type { ReconciliationStatus } from '#/generated/prisma/enums'
import {
  nextStatusOnCardTap,
  transactionPayeeLabel,
} from '#/lib/reconciliation'
import type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'
import {
  directionFromSignedAmount,
  magnitudeFromSignedAmount,
} from '#/lib/transaction-edit'
import { transactionTypeNeedsDirection } from '#/lib/transaction-amount'
import type { TransactionListItem } from '#/server/transactions'
import {
  finishAccountReconciliation,
  setTransactionReconciliationStatus,
  updateTransaction,
} from '#/server/transactions'

type ReconciliationModeProps = {
  accountId: string
  transactions: TransactionListItem[]
  payees: ColoredTaxonomyRef[]
  search: AccountTransactionsSearch
}

function isoToDateInputValue(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10)
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function statusCardClass(status: ReconciliationStatus): string {
  switch (status) {
    case 'CLEARED':
      return 'border-success/40 bg-success/10 opacity-80'
    case 'NEEDS_REVIEW':
      return 'border-warning/50 bg-warning/10'
    default:
      return 'border-base-300 bg-base-100'
  }
}

export function ReconciliationMode({
  accountId,
  transactions,
  payees: initialPayees,
  search,
}: ReconciliationModeProps) {
  const navigate = useNavigate({ from: '/accounts/$accountId/' })
  const router = useRouter()
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const finishDialogRef = useRef<HTMLDialogElement>(null)

  const openItems = useMemo(
    () =>
      transactions.filter((txn) => txn.reconciliationStatus !== 'RECONCILED'),
    [transactions],
  )
  const needsReview = useMemo(
    () =>
      openItems.filter((txn) => txn.reconciliationStatus === 'NEEDS_REVIEW'),
    [openItems],
  )
  const clearedCount = useMemo(
    () =>
      openItems.filter((txn) => txn.reconciliationStatus === 'CLEARED').length,
    [openItems],
  )

  const reconView = search.reconView

  function setSearch(
    patch: Partial<Pick<AccountTransactionsSearch, 'mode' | 'reconView'>>,
  ) {
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    })
  }

  async function applyStatus(
    id: string,
    status: 'UNCLEARED' | 'CLEARED' | 'NEEDS_REVIEW',
  ) {
    setError(null)
    setPendingIds((prev) => new Set(prev).add(id))
    try {
      await setTransactionReconciliationStatus({ data: { id, status } })
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update reconciliation status.',
      )
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function onCardTap(txn: TransactionListItem) {
    const next = nextStatusOnCardTap(txn.reconciliationStatus)
    if (!next || pendingIds.has(txn.id)) return
    await applyStatus(txn.id, next)
  }

  async function onFinish() {
    setFinishing(true)
    setError(null)
    try {
      await finishAccountReconciliation({ data: { accountId } })
      finishDialogRef.current?.close()
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to finish reconciliation.',
      )
    } finally {
      setFinishing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="rounded-box border border-base-300 bg-base-200/40 px-4 py-3">
        <h2 className="text-lg font-semibold">Reconciliation</h2>
        <p className="text-sm text-base-content/70">
          Tap a transaction to mark it cleared. Use the magnifying glass to send
          it to needs review.
        </p>
      </div>

      {error ? (
        <div className="alert alert-error text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {reconView === 'review' ? (
        <NeedsReviewQueue
          items={needsReview}
          payees={initialPayees}
          pendingIds={pendingIds}
          onStatus={applyStatus}
          onSaved={async () => {
            await router.invalidate()
          }}
          onError={setError}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {openItems.length === 0 ? (
            <li className="rounded-box border border-dashed border-base-300 px-4 py-8 text-center text-sm text-base-content/60">
              No open transactions to reconcile.
            </li>
          ) : (
            openItems.map((txn) => {
              const busy = pendingIds.has(txn.id)
              const amount = Number(txn.amount)
              const amountTone =
                amount < 0
                  ? 'text-error'
                  : amount > 0
                    ? 'text-success'
                    : 'text-base-content'
              return (
                <li key={txn.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-disabled={busy}
                    aria-label={`Mark ${transactionPayeeLabel(txn)} as ${
                      txn.reconciliationStatus === 'CLEARED'
                        ? 'uncleared'
                        : 'cleared'
                    }`}
                    className={`flex w-full items-stretch gap-2 rounded-box border px-3 py-3 text-left transition ${statusCardClass(txn.reconciliationStatus)} ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:brightness-95'}`}
                    onClick={() => void onCardTap(txn)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void onCardTap(txn)
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2 text-xs text-base-content/60">
                        <span>{formatTransactionDate(txn.date)}</span>
                        {txn.reconciliationStatus === 'CLEARED' ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <HiCheck className="size-3.5" aria-hidden />
                            Cleared
                          </span>
                        ) : null}
                        {txn.reconciliationStatus === 'NEEDS_REVIEW' ? (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <HiOutlineExclamation
                              className="size-3.5"
                              aria-hidden
                            />
                            Needs review
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate font-medium">
                        {transactionPayeeLabel(txn)}
                      </div>
                    </div>
                    <div
                      className={`flex items-center tabular-nums font-semibold ${amountTone}`}
                    >
                      {formatAccountCurrency(txn.amount)}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-square btn-sm self-center"
                      aria-label="Mark as needs review"
                      disabled={
                        busy || txn.reconciliationStatus === 'NEEDS_REVIEW'
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        void applyStatus(txn.id, 'NEEDS_REVIEW')
                      }}
                    >
                      <HiOutlineSearch className="size-5" aria-hidden />
                    </button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm ${reconView === 'list' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSearch({ reconView: 'list' })}
            >
              List
            </button>
            <button
              type="button"
              className={`btn btn-sm ${reconView === 'review' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSearch({ reconView: 'review' })}
            >
              Needs review ({needsReview.length})
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setSearch({ mode: '', reconView: 'list' })}
            >
              <HiX className="size-4" aria-hidden />
              Exit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={clearedCount === 0}
              onClick={() => finishDialogRef.current?.showModal()}
            >
              Finish reconciliation
            </button>
          </div>
        </div>
      </div>

      <dialog ref={finishDialogRef} className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Finish reconciliation?</h3>
          <p className="py-3 text-sm text-base-content/80">
            Mark {clearedCount} cleared transaction
            {clearedCount === 1 ? '' : 's'} as reconciled? Reconciled items
            cannot be edited.
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={finishing}
              onClick={() => finishDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={finishing || clearedCount === 0}
              onClick={() => void onFinish()}
            >
              {finishing ? 'Finishing…' : 'Finish'}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </div>
  )
}

type NeedsReviewQueueProps = {
  items: TransactionListItem[]
  payees: ColoredTaxonomyRef[]
  pendingIds: Set<string>
  onStatus: (
    id: string,
    status: 'UNCLEARED' | 'CLEARED' | 'NEEDS_REVIEW',
  ) => Promise<void>
  onSaved: () => Promise<void>
  onError: (message: string | null) => void
}

function NeedsReviewQueue({
  items,
  payees: initialPayees,
  pendingIds,
  onStatus,
  onSaved,
  onError,
}: NeedsReviewQueueProps) {
  const [payeeOptions, setPayeeOptions] = useState(initialPayees)
  const payeeDialogRef = useRef<HTMLDialogElement>(null)
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        date: string
        payeeId: string
        amount: string
        direction: 'in' | 'out'
      }
    >
  >({})
  const [savingId, setSavingId] = useState<string | null>(null)

  function draftFor(txn: TransactionListItem) {
    return (
      drafts[txn.id] ?? {
        date: isoToDateInputValue(txn.date),
        payeeId: txn.payee?.id ?? '',
        amount: magnitudeFromSignedAmount(txn.amount),
        direction: directionFromSignedAmount(txn.amount),
      }
    )
  }

  function updateDraft(
    txnId: string,
    txn: TransactionListItem,
    patch: Partial<ReturnType<typeof draftFor>>,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [txnId]: { ...draftFor(txn), ...patch },
    }))
  }

  async function save(txn: TransactionListItem) {
    const draft = draftFor(txn)
    const isTransfer = txn.type === 'TRANSFER'
    const needsDirection = transactionTypeNeedsDirection(txn.type)
    setSavingId(txn.id)
    onError(null)
    try {
      await updateTransaction({
        data: {
          id: txn.id,
          amount: draft.amount,
          date: draft.date,
          description: txn.description,
          payee: isTransfer ? null : draft.payeeId || null,
          category: isTransfer ? null : txn.category?.id || null,
          tags: isTransfer ? [] : txn.tags.map((tag) => tag.id),
          keepAttachmentIds: txn.attachments.map((item) => item.id),
          attachments: [],
          duringReconciliation: true,
          ...(needsDirection ? { direction: draft.direction } : {}),
        },
      })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[txn.id]
        return next
      })
      await onSaved()
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Failed to update transaction during reconciliation.',
      )
    } finally {
      setSavingId(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-base-300 px-4 py-8 text-center text-sm text-base-content/60">
        No transactions need review.
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((txn) => {
        const draft = draftFor(txn)
        const busy = pendingIds.has(txn.id) || savingId === txn.id
        const isTransfer = txn.type === 'TRANSFER'
        const needsDirection = transactionTypeNeedsDirection(txn.type)

        return (
          <li
            key={txn.id}
            className="rounded-box border border-warning/40 bg-base-100 p-4"
          >
            <div className="mb-3 flex flex-col gap-3">
              <label className="form-control w-full">
                <span className="label-text text-xs">Date</span>
                <input
                  type="date"
                  className="input input-bordered input-sm w-full"
                  value={draft.date}
                  disabled={busy}
                  onChange={(event) =>
                    updateDraft(txn.id, txn, { date: event.target.value })
                  }
                />
              </label>

              {!isTransfer ? (
                <div className="form-control w-full">
                  <span className="label-text mb-1 text-xs">Payee</span>
                  <TaxonomySelectField
                    title="Payee"
                    options={payeeOptions}
                    value={draft.payeeId}
                    onChange={(id) =>
                      updateDraft(txn.id, txn, { payeeId: id })
                    }
                    onRequestCreate={() => payeeDialogRef.current?.showModal()}
                    createLabel="Create payee"
                    emptyLabel="No payees yet — create one to get started."
                    placeholder="Select payee"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <label className="form-control min-w-[8rem] flex-1">
                  <span className="label-text text-xs">Amount</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input input-bordered input-sm w-full"
                    value={draft.amount}
                    disabled={busy}
                    onChange={(event) =>
                      updateDraft(txn.id, txn, { amount: event.target.value })
                    }
                  />
                </label>
                {needsDirection ? (
                  <label className="form-control w-28">
                    <span className="label-text text-xs">Direction</span>
                    <select
                      className="select select-bordered select-sm"
                      value={draft.direction}
                      disabled={busy}
                      onChange={(event) =>
                        updateDraft(txn.id, txn, {
                          direction: event.target.value as 'in' | 'out',
                        })
                      }
                    >
                      <option value="out">Out</option>
                      <option value="in">In</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => void save(txn)}
              >
                {savingId === txn.id ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-success btn-outline"
                disabled={busy}
                onClick={() => void onStatus(txn.id, 'CLEARED')}
              >
                Mark cleared
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy}
                onClick={() => void onStatus(txn.id, 'UNCLEARED')}
              >
                Return to uncleared
              </button>
            </div>
          </li>
        )
      })}

      <dialog ref={payeeDialogRef} className="modal">
        <div className="modal-box">
          <h3 className="mb-4 text-lg font-bold">Create payee</h3>
          <CreatePayeeForm
            dialogRef={payeeDialogRef}
            onCreated={(payee) => {
              setPayeeOptions((prev) =>
                [...prev, payee].sort((a, b) => a.name.localeCompare(b.name)),
              )
            }}
          />
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </ul>
  )
}
