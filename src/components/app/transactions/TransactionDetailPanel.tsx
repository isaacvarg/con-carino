import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { HiOutlineDocument } from 'react-icons/hi'
import type { AttachmentListItem } from '#/lib/attachment-types'
import {
  formatAccountCurrency,
  formatTransactionDate,
  transactionTypeLabel,
} from '#/components/app/accounts/account-utils'
import { accountDetailSearchDefaults } from '#/components/app/accounts/account-detail-search'
import { transactionsSearchDefaults } from '#/components/app/transactions/transactions-search'
import type { TransactionDetailDto } from '#/server/transactions'

type TransactionDetailPanelProps = {
  transaction: TransactionDetailDto
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
      <div className="min-h-12 text-base text-base-content">{children}</div>
    </div>
  )
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
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

export function TransactionDetailPanel({
  transaction,
}: TransactionDetailPanelProps) {
  const amount = Number(transaction.amount)
  const amountTone =
    amount < 0 ? 'text-error' : amount > 0 ? 'text-success' : 'text-base-content'

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-base-content">
            Transaction details
          </h2>
          <p className="text-sm text-base-content/60">
            {formatTransactionDate(transaction.date)} ·{' '}
            {transactionTypeLabel(transaction.type)}
          </p>
        </div>
        <Link
          to="/transactions"
          search={transactionsSearchDefaults}
          className="btn btn-ghost btn-sm"
        >
          All transactions
        </Link>
      </div>

      <div className="app-form rounded-box bg-base-100 p-5 shadow-sm sm:p-6">
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
          <DetailField label="Payee">{dash(transaction.payee?.name)}</DetailField>
          <DetailField label="Category">
            {dash(transaction.category?.name)}
          </DetailField>
          <DetailField label="Tags">
            {transaction.tags.length > 0
              ? transaction.tags.map((tag) => tag.name).join(', ')
              : '—'}
          </DetailField>
          <DetailField label="Description">
            {dash(transaction.description)}
          </DetailField>
        </div>

        {transaction.transferCounterpart ? (
          <div className="mt-4 rounded-lg border border-base-300 p-4">
            <p className="app-form-label">Transfer counterpart</p>
            <p className="mt-1 text-sm text-base-content/70">
              {transaction.transferCounterpart.accountName} ·{' '}
              <span className="tabular-nums">
                {formatAccountCurrency(transaction.transferCounterpart.amount)}
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
          </div>
        ) : null}

        {transaction.careInvoice ? (
          <div className="mt-4 rounded-lg border border-base-300 p-4">
            <p className="app-form-label">Care invoice</p>
            <p className="mt-1 text-sm text-base-content/70">
              This transaction settled a care invoice (
              {transaction.careInvoice.status}).
            </p>
            <Link
              to="/invoices"
              className="link link-hover mt-2 inline-block text-sm font-medium"
            >
              View invoices
            </Link>
          </div>
        ) : null}

        <div className="mt-4">
          <DetailField label="Attachments">
            {transaction.attachments.length === 0 ? (
              '—'
            ) : (
              <div className="flex flex-wrap gap-3">
                {transaction.attachments.map((attachment) => (
                  <AttachmentCard key={attachment.id} attachment={attachment} />
                ))}
              </div>
            )}
          </DetailField>
        </div>

        <div className="mt-4 grid gap-4 border-t border-base-300 pt-4 sm:grid-cols-2">
          <DetailField label="Created">
            <span className="text-sm text-base-content/70">
              {new Date(transaction.createdAt).toLocaleString()}
            </span>
          </DetailField>
          <DetailField label="Updated">
            <span className="text-sm text-base-content/70">
              {new Date(transaction.updatedAt).toLocaleString()}
            </span>
          </DetailField>
        </div>
      </div>
    </div>
  )
}
