import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { TransactionType } from '#/generated/prisma/enums'
import { transactionTypeLabel } from '#/components/app/accounts/account-utils'
import { CreateCategoryForm } from '#/components/app/accounts/CreateCategoryForm'
import { CreateTagForm } from '#/components/app/accounts/CreateTagForm'
import { TaxonomyCreateDialog } from '#/components/app/accounts/TaxonomyCreateDialog'
import { TagSelectField } from '#/components/app/transactions/TagSelectField'
import { TaxonomyBadge } from '#/components/app/transactions/TaxonomyBadge'
import { TaxonomySelectField } from '#/components/app/transactions/TaxonomySelectField'
import { ConfirmDialog } from '#/components/app/ui/confirm-dialog'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
  FormRow,
  FormShell,
} from '#/components/app/ui/form'
import { percentMatchMagnitude } from '#/lib/automation-amount'
import { summarizeAutomation } from '#/lib/automation-matching'
import type { AutomationDto, AutomationKind } from '#/lib/automation-types'
import {
  AUTOMATION_KIND_DESCRIPTIONS,
  AUTOMATION_KIND_LABELS,
  AUTOMATION_KINDS,
  AUTOMATION_TRIGGER_TYPES,
} from '#/lib/automation-types'
import type { ColoredTaxonomyRef } from '#/lib/taxonomy-types'
import { sortByName } from '#/lib/taxonomy-types'
import type { AccountListItem } from '#/server/accounts'
import {
  createAutomation,
  deleteAutomation,
  setAutomationEnabled,
  updateAutomation,
} from '#/server/automations'

type AppUserOption = { id: string; name: string | null; email: string | null }

type AutomationsSettingsPanelProps = {
  automations: AutomationDto[]
  accounts: AccountListItem[]
  tags: ColoredTaxonomyRef[]
  categories: ColoredTaxonomyRef[]
  users: AppUserOption[]
  currentUserId: string | null
}

/** Default trigger type per kind — the case each one was built for. */
const DEFAULT_TRIGGER_TYPE: Record<AutomationKind, TransactionType> = {
  DUPLICATE_TO_ACCOUNT: 'DEPOSIT',
  PERCENT_MATCH: 'WITHDRAWAL',
  LOW_BALANCE_ALERT: 'DEPOSIT',
}

const KIND_BADGE_CLASS: Record<AutomationKind, string> = {
  DUPLICATE_TO_ACCOUNT: 'badge-info',
  PERCENT_MATCH: 'badge-accent',
  LOW_BALANCE_ALERT: 'badge-warning',
}

function userLabel(user: AppUserOption): string {
  return user.name?.trim() || user.email?.trim() || 'Unnamed user'
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AutomationsSettingsPanel({
  automations,
  accounts,
  tags,
  categories,
  users,
  currentUserId,
}: AutomationsSettingsPanelProps) {
  const router = useRouter()

  // Taxonomies are held locally so one created from inside the picker is
  // selectable straight away, rather than only after the loader refetches.
  // Re-seeded from props so a router.invalidate() elsewhere still wins.
  const [tagOptions, setTagOptions] = useState(tags)
  const [categoryOptions, setCategoryOptions] = useState(categories)
  useEffect(() => setTagOptions(tags), [tags])
  useEffect(() => setCategoryOptions(categories), [categories])

  const tagDialogRef = useRef<HTMLDialogElement>(null)
  const categoryDialogRef = useRef<HTMLDialogElement>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [kind, setKind] = useState<AutomationKind>('DUPLICATE_TO_ACCOUNT')
  const [name, setName] = useState('')
  const [triggerAccountId, setTriggerAccountId] = useState('')
  const [triggerType, setTriggerType] = useState<TransactionType>('DEPOSIT')
  const [triggerTagIds, setTriggerTagIds] = useState<string[]>([])
  const [triggerCategoryId, setTriggerCategoryId] = useState('')
  const [targetAccountId, setTargetAccountId] = useState('')
  const [percent, setPercent] = useState('15')
  const [thresholdAmount, setThresholdAmount] = useState('')
  const [notifyUserId, setNotifyUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AutomationDto | null>(null)
  const [deleting, setDeleting] = useState(false)

  function resetForm() {
    setEditingId(null)
    setKind('DUPLICATE_TO_ACCOUNT')
    setName('')
    setTriggerAccountId(accounts[0]?.id ?? '')
    setTriggerType('DEPOSIT')
    setTriggerTagIds([])
    setTriggerCategoryId('')
    setTargetAccountId('')
    setPercent('15')
    setThresholdAmount('')
    setNotifyUserId(currentUserId ?? '')
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(automation: AutomationDto) {
    setEditingId(automation.id)
    setKind(automation.kind)
    setName(automation.name)
    setTriggerAccountId(automation.triggerAccount.id)
    setTriggerType(
      automation.triggerType ?? DEFAULT_TRIGGER_TYPE[automation.kind],
    )
    setTriggerTagIds(automation.triggerTags.map((tag) => tag.id))
    setTriggerCategoryId(automation.triggerCategory?.id ?? '')
    setTargetAccountId(automation.targetAccount?.id ?? '')
    setPercent(
      automation.percent === null ? '15' : String(Number(automation.percent)),
    )
    setThresholdAmount(
      automation.thresholdAmount === null
        ? ''
        : String(Number(automation.thresholdAmount)),
    )
    setNotifyUserId(automation.notifyUser?.id ?? currentUserId ?? '')
    setError(null)
    setShowForm(true)
  }

  /** Kind decides which fields exist, so switching resets the ones it changes. */
  function changeKind(next: AutomationKind) {
    setKind(next)
    setTriggerType(DEFAULT_TRIGGER_TYPE[next])
    if (next === 'LOW_BALANCE_ALERT') {
      setTargetAccountId('')
      setTriggerTagIds([])
      setTriggerCategoryId('')
      if (!notifyUserId) setNotifyUserId(currentUserId ?? '')
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        kind,
        triggerAccountId,
        triggerType,
        triggerTagIds,
        triggerCategoryId: triggerCategoryId || null,
        targetAccountId: targetAccountId || null,
        percent: kind === 'PERCENT_MATCH' ? percent : null,
        thresholdAmount:
          kind === 'LOW_BALANCE_ALERT' ? thresholdAmount : null,
        notifyUserId: kind === 'LOW_BALANCE_ALERT' ? notifyUserId : null,
      }
      if (editingId) {
        await updateAutomation({ data: { id: editingId, ...payload } })
      } else {
        await createAutomation({ data: payload })
      }
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save the automation.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggle(automation: AutomationDto) {
    setTogglingId(automation.id)
    setError(null)
    try {
      await setAutomationEnabled({
        data: { id: automation.id, isEnabled: !automation.isEnabled },
      })
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update the automation.',
      )
    } finally {
      setTogglingId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteAutomation({ data: { id: pendingDelete.id } })
      setPendingDelete(null)
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not delete the automation.',
      )
    } finally {
      setDeleting(false)
    }
  }

  const isBalanceKind = kind === 'LOW_BALANCE_ALERT'
  const percentValue = Number(percent)
  const previewAmount = Number.isFinite(percentValue)
    ? percentMatchMagnitude(100, percentValue)
    : 0
  const targetName =
    accounts.find((account) => account.id === targetAccountId)?.name ??
    'the target account'

  return (
    <div className="flex flex-col gap-4">
      <div className="app-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-base-content">
              Automations
            </h3>
            <p className="mt-1 text-sm text-base-content/60">
              Rules that copy transactions, set money aside, or watch a balance
              for you.
            </p>
          </div>
          {!showForm ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={startAdd}
              disabled={accounts.length === 0}
            >
              Add automation
            </button>
          ) : null}
        </div>

        {accounts.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/60">
            Add an account first — every automation watches one.
          </p>
        ) : null}

        {showForm ? (
          <FormShell
            card={false}
            onSubmit={save}
            className="mt-4 rounded-box border border-base-300 p-4"
          >
            <FormRow>
              <FormField label="Name" htmlFor="automation-name">
                <input
                  id="automation-name"
                  className={FORM_INPUT_CLASS}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Vacation mirror"
                  required
                  autoFocus
                />
              </FormField>
              <FormField
                label="What it does"
                htmlFor="automation-kind"
                hint={
                  editingId
                    ? 'The kind cannot be changed. Delete this rule and add a new one instead.'
                    : AUTOMATION_KIND_DESCRIPTIONS[kind]
                }
              >
                <select
                  id="automation-kind"
                  className={FORM_SELECT_CLASS}
                  value={kind}
                  onChange={(e) => changeKind(e.target.value as AutomationKind)}
                  disabled={Boolean(editingId)}
                >
                  {AUTOMATION_KINDS.map((option) => (
                    <option key={option} value={option}>
                      {AUTOMATION_KIND_LABELS[option]}
                    </option>
                  ))}
                </select>
              </FormField>
            </FormRow>

            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
                When
              </h4>
              <FormRow>
                <FormField
                  label={isBalanceKind ? 'Watch account' : 'Account'}
                  htmlFor="automation-trigger-account"
                >
                  <select
                    id="automation-trigger-account"
                    className={FORM_SELECT_CLASS}
                    value={triggerAccountId}
                    onChange={(e) => setTriggerAccountId(e.target.value)}
                    required
                  >
                    <option value="">Select an account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                {isBalanceKind ? (
                  <FormField
                    label="Alert below"
                    htmlFor="automation-threshold"
                    hint="Sends at most once a day while the balance stays below, and resets when it recovers."
                  >
                    <input
                      id="automation-threshold"
                      className={FORM_INPUT_CLASS}
                      type="number"
                      step="0.01"
                      value={thresholdAmount}
                      onChange={(e) => setThresholdAmount(e.target.value)}
                      placeholder="200.00"
                      required
                    />
                  </FormField>
                ) : (
                  <FormField
                    label="Transaction type"
                    htmlFor="automation-trigger-type"
                  >
                    <select
                      id="automation-trigger-type"
                      className={FORM_SELECT_CLASS}
                      value={triggerType}
                      onChange={(e) =>
                        setTriggerType(e.target.value as TransactionType)
                      }
                    >
                      {AUTOMATION_TRIGGER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {transactionTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
              </FormRow>

              {!isBalanceKind ? (
                <FormRow>
                  <FormField
                    label="Tags"
                    hint="Leave empty to match any tag. With several, any one of them matches."
                  >
                    <TagSelectField
                      options={tagOptions}
                      value={triggerTagIds}
                      onChange={setTriggerTagIds}
                      onRequestCreate={() => tagDialogRef.current?.showModal()}
                    />
                  </FormField>
                  <FormField
                    label="Category"
                    hint="Leave empty to match any category."
                  >
                    <TaxonomySelectField
                      title="Category"
                      options={categoryOptions}
                      value={triggerCategoryId}
                      onChange={setTriggerCategoryId}
                      onRequestCreate={() =>
                        categoryDialogRef.current?.showModal()
                      }
                      createLabel="New category"
                      emptyLabel="No categories yet."
                      placeholder="Any category"
                    />
                  </FormField>
                </FormRow>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
                Then
              </h4>
              {isBalanceKind ? (
                <FormField label="Notify" htmlFor="automation-notify">
                  <select
                    id="automation-notify"
                    className={FORM_SELECT_CLASS}
                    value={notifyUserId}
                    onChange={(e) => setNotifyUserId(e.target.value)}
                    required
                  >
                    <option value="">Select a person</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)}
                      </option>
                    ))}
                  </select>
                </FormField>
              ) : (
                <FormRow>
                  <FormField
                    label={
                      kind === 'PERCENT_MATCH'
                        ? 'Target account'
                        : 'Duplicate into'
                    }
                    htmlFor="automation-target-account"
                    hint="Usually a virtual account."
                  >
                    <select
                      id="automation-target-account"
                      className={FORM_SELECT_CLASS}
                      value={targetAccountId}
                      onChange={(e) => setTargetAccountId(e.target.value)}
                      required
                    >
                      <option value="">Select an account</option>
                      {accounts
                        .filter((account) => account.id !== triggerAccountId)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  {kind === 'PERCENT_MATCH' ? (
                    <FormField
                      label="Percent"
                      htmlFor="automation-percent"
                      hint={`A ${formatMoney(100)} ${transactionTypeLabel(
                        triggerType,
                      ).toLowerCase()} creates a ${formatMoney(
                        previewAmount,
                      )} ${transactionTypeLabel(
                        triggerType,
                      ).toLowerCase()} in ${targetName}.`}
                    >
                      <label className="input input-bordered flex min-h-12 w-full items-center gap-2 px-4">
                        <input
                          id="automation-percent"
                          className="grow"
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="100"
                          value={percent}
                          onChange={(e) => setPercent(e.target.value)}
                          required
                        />
                        <span className="text-base-content/50">%</span>
                      </label>
                    </FormField>
                  ) : null}
                </FormRow>
              )}
            </div>

            {error ? (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            ) : null}

            <FormActions>
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Update automation'
                    : 'Create automation'}
              </button>
            </FormActions>
          </FormShell>
        ) : automations.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/60">
            No automations yet. Add one to duplicate deposits, set aside a
            percentage of withdrawals, or watch a balance.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {automations.map((automation) => (
              <li key={automation.id} className="flex flex-col gap-3 app-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`badge badge-sm ${KIND_BADGE_CLASS[automation.kind]}`}
                      >
                        {AUTOMATION_KIND_LABELS[automation.kind]}
                      </span>
                      {!automation.isEnabled ? (
                        <span className="badge badge-sm badge-ghost">Off</span>
                      ) : null}
                    </div>
                    <p className="mt-2 font-semibold text-base-content">
                      {automation.name}
                    </p>
                    <p className="mt-1 text-sm text-base-content/60">
                      {summarizeAutomation(automation)}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm shrink-0"
                    checked={automation.isEnabled}
                    disabled={togglingId === automation.id}
                    onChange={() => void toggle(automation)}
                    aria-label={`${automation.isEnabled ? 'Disable' : 'Enable'} ${automation.name}`}
                  />
                </div>

                {automation.triggerTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {automation.triggerTags.map((tag) => (
                      <TaxonomyBadge
                        key={tag.id}
                        name={tag.name}
                        bgColor={tag.bgColor}
                        textColor={tag.textColor}
                      />
                    ))}
                  </div>
                ) : null}

                {automation.lastRun ? (
                  <p className="text-xs text-base-content/50">
                    Last run {formatRunTime(automation.lastRun.createdAt)} ·{' '}
                    {automation.lastRun.status.toLowerCase()}
                    {automation.lastRun.detail
                      ? ` · ${automation.lastRun.detail}`
                      : ''}
                  </p>
                ) : (
                  <p className="text-xs text-base-content/50">Has not run yet.</p>
                )}

                <div className="mt-auto flex justify-end gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEdit(automation)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-error"
                    onClick={() => setPendingDelete(automation)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!showForm && error ? (
          <p className="mt-4 text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <p className="px-1 text-xs text-base-content/50">
        Automations run when a transaction is added — not when one is edited, and
        not on transfers. A transaction an automation creates never triggers
        another automation.
      </p>

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
            // Creating a tag from inside the trigger picker means you want to
            // filter on it, so select it rather than making them pick again.
            setTriggerTagIds((prev) =>
              prev.includes(tag.id) ? prev : [...prev, tag.id],
            )
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
            setTriggerCategoryId(category.id)
          }}
        />
      </TaxonomyCreateDialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete automation?"
        message={
          <>
            “{pendingDelete?.name}” will stop running. Transactions it already
            created stay in your ledger.
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
