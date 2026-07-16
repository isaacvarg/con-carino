import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { CareSwapRequestDto } from '#/server/care'
import { reviewSwapRequest } from '#/server/care'
import { formatTimeRange } from './care-utils'

type CareSwapsPanelProps = {
  swaps: CareSwapRequestDto[]
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
          Any signed-in user can approve or reject.
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
                  {swap.claimForPersonName} claims open slot
                </p>
                <p className="mt-1 text-sm text-base-content/70">
                  Relinquish:{' '}
                  {formatTimeRange(
                    swap.relinquishStartsAt,
                    swap.relinquishEndsAt,
                  )}
                </p>
                <p className="text-sm text-base-content/70">
                  Claim:{' '}
                  {formatTimeRange(swap.claimStartsAt, swap.claimEndsAt)}
                </p>
                <p className="mt-1 text-xs text-base-content/50">
                  Requested by {swap.requestedByName || 'a user'}
                  {swap.notes ? ` · ${swap.notes}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === swap.id}
                    onClick={() => review(swap.id, 'CANCELLED')}
                  >
                    Cancel
                  </button>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{swap.claimForPersonName}</p>
                    <p className="text-sm text-base-content/60">
                      {formatTimeRange(
                        swap.relinquishStartsAt,
                        swap.relinquishEndsAt,
                      )}{' '}
                      →{' '}
                      {formatTimeRange(swap.claimStartsAt, swap.claimEndsAt)}
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
