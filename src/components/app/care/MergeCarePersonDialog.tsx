import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { FORM_SELECT_CLASS, FormField } from '#/components/app/ui/form'
import type { CarePersonDto } from '#/server/care'
import { listCarePeople, mergeCarePeople } from '#/server/care'

export type MergeCarePersonSource = { id: string; name: string }

type MergeCarePersonDialogProps = {
  /** Person being absorbed into another. Dialog is closed when null. */
  source: MergeCarePersonSource | null
  /** Pre-selected target id, if one already exists in the fetched list. */
  defaultTargetId?: string
  onClose: () => void
}

/**
 * Shared by CarePeoplePanel (active people) and ArchivedSettingsPanel
 * (already-archived duplicates) — the source can be either, but the target
 * list is always active people, so the merge always leaves a usable survivor.
 */
export function MergeCarePersonDialog({
  source,
  defaultTargetId,
  onClose,
}: MergeCarePersonDialogProps) {
  const router = useRouter()
  const [targets, setTargets] = useState<CarePersonDto[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!source) return
    setError(null)
    setLoadingTargets(true)
    listCarePeople()
      .then((people) => {
        const options = people.filter((p) => p.id !== source.id)
        setTargets(options)
        setTargetId(
          defaultTargetId && options.some((p) => p.id === defaultTargetId)
            ? defaultTargetId
            : '',
        )
      })
      .catch(() => setError('Could not load people to merge into.'))
      .finally(() => setLoadingTargets(false))
    // Re-fetch whenever a different person is being merged away.
  }, [source?.id])

  if (!source) return null

  async function confirm() {
    if (!source || !targetId) return
    setBusy(true)
    setError(null)
    try {
      await mergeCarePeople({ data: { keepId: targetId, mergeId: source.id } })
      await router.invalidate()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog className="modal modal-open" role="alertdialog" aria-modal="true">
      <div className="modal-box max-w-sm">
        <h3 className="text-lg font-semibold text-base-content">
          Merge &ldquo;{source.name}&rdquo;
        </h3>
        <p className="mt-2 text-sm text-base-content/70">
          &ldquo;{source.name}&rdquo; will be deleted. Its schedule history,
          invoices, and linked app user (if any) move to whoever you pick
          below.
        </p>
        <div className="mt-4">
          <FormField label="Merge into" htmlFor="merge-target">
            <select
              id="merge-target"
              className={FORM_SELECT_CLASS}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={loadingTargets || busy}
            >
              <option value="">
                {loadingTargets ? 'Loading…' : 'Select a person'}
              </option>
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.userEmail
                    ? ` (${p.userName || p.userEmail})`
                    : ' (offline)'}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-error"
            onClick={() => void confirm()}
            disabled={busy || !targetId}
          >
            {busy ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose} disabled={busy}>
          close
        </button>
      </form>
    </dialog>
  )
}
