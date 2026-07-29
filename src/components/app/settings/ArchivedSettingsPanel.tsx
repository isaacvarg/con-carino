import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/app/ui/confirm-dialog'
import { Tabs, type TabItem } from '#/components/app/ui/Tabs'
import { ACTIVITY_ENTITY_LABELS } from '#/lib/activity'
import { restoreAccount, restoreAccountGroup } from '#/server/accounts'
import type { ArchivedItem, ArchivedKind } from '#/server/archived'
import { restoreCarePerson } from '#/server/care'
import {
  deleteArchivedTaxonomy,
  restoreTaxonomy,
  type TaxonomyKind,
} from '#/server/taxonomies'
import {
  deleteTransactionType,
  restoreTransactionType,
} from '#/server/transaction-types'
import { restoreUser } from '#/server/users'

type ArchivedSettingsPanelProps = {
  items: ArchivedItem[]
}

const TAB_ORDER: ArchivedKind[] = [
  'tag',
  'category',
  'payee',
  'account',
  'account_group',
  'care_person',
  'user',
  'transaction_type',
]

/** Which kinds support a permanent delete from this screen. */
const TAXONOMY_KINDS: ArchivedKind[] = ['tag', 'category', 'payee']

function kindLabel(kind: ArchivedKind): string {
  return ACTIVITY_ENTITY_LABELS[kind] ?? kind
}

function formatArchivedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

async function restoreItem(item: ArchivedItem): Promise<void> {
  switch (item.kind) {
    case 'tag':
    case 'category':
    case 'payee':
      await restoreTaxonomy({
        data: { kind: item.kind as TaxonomyKind, id: item.id },
      })
      return
    case 'account':
      await restoreAccount({ data: { id: item.id } })
      return
    case 'account_group':
      await restoreAccountGroup({ data: { id: item.id } })
      return
    case 'care_person':
      await restoreCarePerson({ data: { id: item.id } })
      return
    case 'user':
      await restoreUser({ data: { userId: item.id } })
      return
    case 'transaction_type':
      await restoreTransactionType({ data: { id: item.id } })
      return
    default: {
      const _exhaustive: never = item.kind
      return _exhaustive
    }
  }
}

export function ArchivedSettingsPanel({ items }: ArchivedSettingsPanelProps) {
  const router = useRouter()

  const presentKinds = TAB_ORDER.filter((kind) =>
    items.some((item) => item.kind === kind),
  )
  const [tab, setTab] = useState<ArchivedKind>(presentKinds[0] ?? 'tag')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ArchivedItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // The active tab can vanish once its last item is restored.
  const activeTab = presentKinds.includes(tab) ? tab : (presentKinds[0] ?? tab)
  const visible = items.filter((item) => item.kind === activeTab)

  const tabs: TabItem<ArchivedKind>[] = presentKinds.map((kind) => ({
    id: kind,
    label: `${kindLabel(kind)} (${items.filter((i) => i.kind === kind).length})`,
  }))

  async function restore(item: ArchivedItem) {
    setBusyId(item.id)
    setError(null)
    try {
      await restoreItem(item)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore.')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError(null)
    try {
      if (pendingDelete.kind === 'transaction_type') {
        await deleteTransactionType({ data: { id: pendingDelete.id } })
      } else {
        await deleteArchivedTaxonomy({
          data: {
            kind: pendingDelete.kind as TaxonomyKind,
            id: pendingDelete.id,
          },
        })
      }
      setPendingDelete(null)
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.')
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="app-card p-4 sm:p-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-base-content">
          Archived
        </h3>
        <p className="mt-1 text-sm text-base-content/60">
          Things removed while still in use. They stay attached to the records
          that reference them, but are hidden from every list and picker.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">
          Nothing is archived.
        </p>
      ) : (
        <>
          <Tabs
            className="mt-4"
            tabs={tabs}
            value={activeTab}
            onChange={setTab}
          />

          <ul className="mt-4 flex flex-col gap-2">
            {visible.map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-base-content">
                    {item.name}
                  </p>
                  <p className="text-xs text-base-content/60">
                    Archived {formatArchivedAt(item.archivedAt)}
                    {item.detail ? ` · ${item.detail}` : null}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => void restore(item)}
                  >
                    {busyId === item.id ? 'Restoring…' : 'Restore'}
                  </button>
                  {TAXONOMY_KINDS.includes(item.kind) ||
                  item.kind === 'transaction_type' ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => setPendingDelete(item)}
                    >
                      Delete permanently
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {error ? (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Permanently delete “${pendingDelete?.name ?? ''}”?`}
        message="This cannot be undone. It will only go through if nothing references it any more."
        confirmLabel="Delete permanently"
        busy={deleting}
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
