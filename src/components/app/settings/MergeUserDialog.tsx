import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { FORM_SELECT_CLASS, FormField } from '#/components/app/ui/form'
import type { UserMergeCandidate } from '#/server/users'
import { listUserMergeCandidates, mergeUsers } from '#/server/users'

type MergeUserDialogProps = {
  /** User that survives the merge. Dialog is closed when null. */
  keep: { id: string; label: string } | null
  onClose: () => void
}

function candidateLabel(c: UserMergeCandidate): string {
  const name = c.name ?? c.carePersonName
  const base =
    name && c.email && name !== c.email
      ? `${name} (${c.email})`
      : (name ?? c.email ?? c.id)
  return c.archived ? `${base} — archived` : base
}

/**
 * The page's user is always the one kept: an admin fixing a duplicate opens
 * the original account and pulls the stray one in, which reads the right way
 * round and keeps the survivor's Settings URL stable.
 */
export function MergeUserDialog({ keep, onClose }: MergeUserDialogProps) {
  const router = useRouter()
  const [candidates, setCandidates] = useState<UserMergeCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [mergeId, setMergeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!keep) return
    setError(null)
    setMergeId('')
    setLoading(true)
    listUserMergeCandidates({ data: { userId: keep.id } })
      .then(setCandidates)
      .catch(() => setError('Could not load users to merge.'))
      .finally(() => setLoading(false))
  }, [keep?.id])

  if (!keep) return null

  const selected = candidates.find((c) => c.id === mergeId)

  async function confirm() {
    if (!keep || !mergeId) return
    setBusy(true)
    setError(null)
    try {
      await mergeUsers({ data: { keepId: keep.id, mergeId } })
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
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-semibold text-base-content">
          Merge a user into {keep.label}
        </h3>
        <p className="mt-2 text-sm text-base-content/70">
          The user you pick is deleted. Everything they own or did — accounts,
          transactions, documents, schedule, invoices, activity — moves to{' '}
          {keep.label}, and their caregiver record is merged into{' '}
          {keep.label}&rsquo;s. Their Google/Discord links and email move over
          too, so they can keep signing in either way.
        </p>
        <div className="mt-4">
          <FormField label="User to merge in" htmlFor="merge-user">
            <select
              id="merge-user"
              className={FORM_SELECT_CLASS}
              value={mergeId}
              onChange={(e) => setMergeId(e.target.value)}
              disabled={loading || busy}
            >
              <option value="">
                {loading ? 'Loading…' : 'Select a user'}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {candidateLabel(c)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {selected ? (
          <p className="mt-3 text-sm text-warning">
            This cannot be undone. {candidateLabel(selected)} will be signed
            out and removed.
          </p>
        ) : null}
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
            disabled={busy || !mergeId}
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
