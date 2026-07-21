import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { CareSwapRequestDto, CareSwapWindowDto } from '#/server/care'
import { reviewSwapRequest } from '#/server/care'
import { formatTimeRange } from './care-utils'

type CareSwapsPanelProps = {
  swaps: CareSwapRequestDto[]
}

function WindowList({
  label,
  windows,
  emptyLabel,
}: {
  label: string
  windows: CareSwapWindowDto[]
  emptyLabel?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      {windows.length === 0 ? (
        <p className="text-sm text-base-content/60">{emptyLabel}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {windows.map((window) => (
            <li key={window.occurrenceId} className="text-sm text-base-content/70">
              {formatTimeRange(window.startsAt, window.endsAt)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CareSwapsPanel({ swaps }: CareSwapsPanelProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const pending = swaps.filter((s) => s.status === 'PENDING')
  const history = swaps.filter((s) => s.status !== 'PENDING')

  async function review(
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) {
    setBusyId(id)
    setError(null)
    try {
      await reviewSwapRequest({ data: { id, decision } })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update swap.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="app-card p-4">
        <h3 className="font-semibold">Pending swaps</h3>
        <p className="mt-1 text-sm text-base-content/60">
          Whoever is losing coverage approves. Anyone can approve for a
          caregiver without an app account.
        </p>
        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">No pending requests.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((swap) => (
              <li
                key={swap.id}
                className="rounded-lg border border-base-300 p-4"
              >
                <p className="font-medium">
                  {swap.requesterPersonName} wants{' '}
                  {swap.takeWindows.length} window
                  {swap.takeWindows.length === 1 ? '' : 's'} from{' '}
                  {swap.targetPersonName}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <WindowList
                    label={`${swap.requesterPersonName} takes`}
                    windows={swap.takeWindows}
                  />
                  <WindowList
                    label={`${swap.targetPersonName} receives`}
                    windows={swap.giveWindows}
                    emptyLabel="Nothing offered in exchange."
                  />
                </div>
                <p className="mt-3 text-xs text-base-content/50">
                  Requested by {swap.requestedByName || 'a user'}
                  {swap.notes ? ` · ${swap.notes}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {swap.canReview ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyId === swap.id}
                        onClick={() => review(swap.id, 'APPROVED')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busyId === swap.id}
                        onClick={() => review(swap.id, 'REJECTED')}
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-base-content/60">
                      Waiting on {swap.targetPersonName} to approve.
                    </span>
                  )}
                  {swap.canCancel ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === swap.id}
                      onClick={() => review(swap.id, 'CANCELLED')}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="app-card p-4">
        <h3 className="font-semibold">History</h3>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-base-content/50">No past swaps.</p>
        ) : (
          <ul className="mt-4 divide-y divide-base-300">
            {history.map((swap) => (
              <li key={swap.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {swap.requesterPersonName} ← {swap.targetPersonName}
                    </p>
                    <p className="text-sm text-base-content/60">
                      {swap.takeWindows.length} taken
                      {swap.giveWindows.length > 0
                        ? ` · ${swap.giveWindows.length} given back`
                        : ''}
                      {swap.takeWindows[0]
                        ? ` · from ${formatTimeRange(
                            swap.takeWindows[0].startsAt,
                            swap.takeWindows[0].endsAt,
                          )}`
                        : ''}
                    </p>
                  </div>
                  <span className="badge badge-outline">{swap.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
