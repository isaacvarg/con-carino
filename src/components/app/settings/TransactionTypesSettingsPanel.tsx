import { useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ConfirmDialog } from '#/components/app/ui/confirm-dialog'
import {
  FORM_INPUT_CLASS,
  FORM_SELECT_CLASS,
  FormActions,
  FormField,
  FormShell,
} from '#/components/app/ui/form'
import type { TransactionSign } from '#/generated/prisma/enums'
import { clearTransactionTypesCache } from '#/lib/transaction-type-registry'
import {
  PROTECTED_TRANSACTION_TYPE_KEYS,
  SELECTABLE_TRANSACTION_SIGNS,
  TRANSACTION_SIGN_LABELS,
  type TransactionTypeDto,
} from '#/lib/transaction-types'
import {
  archiveTransactionType,
  createTransactionType,
  updateTransactionType,
} from '#/server/transaction-types'

type TransactionTypesSettingsPanelProps = {
  types: TransactionTypeDto[]
  /** How many transactions and automations point at each type, by id. */
  usage: Record<string, number>
}

function isProtected(type: TransactionTypeDto): boolean {
  return PROTECTED_TRANSACTION_TYPE_KEYS.includes(
    type.key as (typeof PROTECTED_TRANSACTION_TYPE_KEYS)[number],
  )
}

export function TransactionTypesSettingsPanel({
  types,
  usage,
}: TransactionTypesSettingsPanelProps) {
  const router = useRouter()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TransactionTypeDto | null>(null)
  const [label, setLabel] = useState('')
  const [sign, setSign] = useState<TransactionSign>('NEGATIVE')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<TransactionTypeDto | null>(
    null,
  )
  const [removing, setRemoving] = useState(false)

  const live = types.filter((type) => !type.archivedAt)

  /**
   * The sign is only editable while nothing depends on it. Amounts are stored
   * already-signed, so flipping it later would invert existing rows without
   * touching their values. The server enforces this too.
   */
  const signLocked =
    editing !== null && (editing.isSystem || (usage[editing.id] ?? 0) > 0)

  function resetForm() {
    setEditing(null)
    setLabel('')
    setSign('NEGATIVE')
    setError(null)
    setShowForm(false)
  }

  function startAdd() {
    resetForm()
    setShowForm(true)
  }

  function startEdit(type: TransactionTypeDto) {
    setEditing(type)
    setLabel(type.label)
    setSign(type.sign)
    setError(null)
    setShowForm(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateTransactionType({
          data: {
            id: editing.id,
            label,
            ...(signLocked ? {} : { sign }),
          },
        })
      } else {
        await createTransactionType({ data: { label, sign } })
      }
      clearTransactionTypesCache()
      resetForm()
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save transaction type.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    setRemoving(true)
    setError(null)
    try {
      await archiveTransactionType({ data: { id: pendingRemove.id } })
      clearTransactionTypesCache()
      setPendingRemove(null)
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not remove transaction type.',
      )
      setPendingRemove(null)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="app-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-base-content">
            Transaction types
          </h3>
          <p className="mt-1 text-sm text-base-content/60">
            What a transaction can be, and whether it adds to or subtracts from
            an account balance.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={startAdd}
          >
            Add type
          </button>
        ) : null}
      </div>

      {showForm ? (
        <FormShell
          card={false}
          onSubmit={save}
          className="mt-4 rounded-box border border-base-300 p-4"
        >
          <FormField label="Name" htmlFor="txn-type-label">
            <input
              id="txn-type-label"
              className={FORM_INPUT_CLASS}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormField
            label="Effect on balance"
            htmlFor="txn-type-sign"
            hint={
              signLocked
                ? editing?.isSystem
                  ? 'Built-in types keep their effect. Only the name can change.'
                  : 'Locked because transactions already use this type. Add a new type instead.'
                : 'Cannot be changed once a transaction uses this type.'
            }
          >
            <select
              id="txn-type-sign"
              className={FORM_SELECT_CLASS}
              value={sign}
              disabled={signLocked}
              onChange={(e) => setSign(e.target.value as TransactionSign)}
            >
              {/* A locked DIRECTIONAL built-in must still show its own value. */}
              {(signLocked
                ? [sign]
                : SELECTABLE_TRANSACTION_SIGNS
              ).map((option) => (
                <option key={option} value={option}>
                  {TRANSACTION_SIGN_LABELS[option]}
                </option>
              ))}
            </select>
          </FormField>
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
              {saving ? 'Saving…' : editing ? 'Update type' : 'Create type'}
            </button>
          </FormActions>
        </FormShell>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((type) => {
            const count = usage[type.id] ?? 0
            return (
              <li key={type.id} className="flex flex-col gap-2 app-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-base-content">
                    {type.label}
                  </span>
                  {type.isSystem ? (
                    <span className="badge badge-ghost badge-sm">Built-in</span>
                  ) : null}
                </div>
                <p className="text-xs text-base-content/60">
                  {TRANSACTION_SIGN_LABELS[type.sign]}
                </p>
                <p className="text-xs text-base-content/50">
                  {count === 0
                    ? 'Not used yet'
                    : `Used by ${count} ${count === 1 ? 'record' : 'records'}`}
                </p>
                <div className="mt-auto flex justify-end gap-1 pt-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEdit(type)}
                  >
                    Edit
                  </button>
                  {!isProtected(type) ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => setPendingRemove(type)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && !showForm ? (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Remove “${pendingRemove?.label ?? ''}”?`}
        message={
          pendingRemove && (usage[pendingRemove.id] ?? 0) > 0
            ? `${usage[pendingRemove.id]} records use this type, so it will be archived: hidden from every picker, but still shown on the transactions that already have it.`
            : 'Nothing uses this type, so it will be deleted permanently.'
        }
        confirmLabel="Remove"
        busy={removing}
        tone="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}
