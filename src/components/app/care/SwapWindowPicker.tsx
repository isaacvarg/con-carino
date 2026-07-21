import { useEffect, useMemo, useState } from 'react'
import type { CareSwapWindowDto } from '#/server/care'
import { listSwapCandidateWindows } from '#/server/care'
import { dayKey, formatClockRange, startOfWeek } from './care-utils'

type SwapWindowPickerProps = {
  personId: string
  personName: string
  /** Selected occurrence ids, which may include windows from other weeks */
  selectedIds: string[]
  onToggle: (occurrenceId: string) => void
  /** Day whose week the picker opens on */
  initialDay: string
  emptyLabel: string
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/**
 * Week-at-a-time multi-select over one person's assigned windows. Selections
 * survive paging between weeks, which is what makes "swap this whole weekend"
 * — or a trade spanning two weeks — a single request.
 */
export function SwapWindowPicker({
  personId,
  personName,
  selectedIds,
  onToggle,
  initialDay,
  emptyLabel,
}: SwapWindowPickerProps) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(parseDay(initialDay)),
  )
  const [windows, setWindows] = useState<CareSwapWindowDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return end
  }, [weekStart])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listSwapCandidateWindows({
      data: {
        personId,
        rangeStart: weekStart.toISOString(),
        rangeEnd: weekEnd.toISOString(),
      },
    })
      .then((rows) => {
        if (!cancelled) setWindows(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setWindows([])
        setError(
          err instanceof Error ? err.message : 'Could not load windows.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [personId, weekStart, weekEnd])

  const byDay = useMemo(() => {
    const groups = new Map<string, CareSwapWindowDto[]>()
    for (const window of windows) {
      const key = dayKey(new Date(window.startsAt))
      const bucket = groups.get(key)
      if (bucket) bucket.push(window)
      else groups.set(key, [window])
    }
    return [...groups.entries()]
  }, [windows])

  function shiftWeek(delta: number) {
    setWeekStart((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-base-300">
      <div className="flex items-center justify-between gap-2 border-b border-base-300 px-3 py-2">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => shiftWeek(-1)}
          aria-label="Previous week"
        >
          ‹
        </button>
        <p className="text-sm font-medium">
          Week of{' '}
          {weekStart.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => shiftWeek(1)}
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-3">
        {error ? (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="text-sm text-base-content/50">Loading…</p>
        ) : byDay.length === 0 ? (
          <p className="text-sm text-base-content/50">{emptyLabel}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {byDay.map(([day, dayWindows]) => (
              <div key={day}>
                <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                  {parseDay(day).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <ul className="mt-1 space-y-1">
                  {dayWindows.map((window) => {
                    const isSelected = selectedIds.includes(window.occurrenceId)
                    return (
                      <li key={window.occurrenceId}>
                        <button
                          type="button"
                          onClick={() => onToggle(window.occurrenceId)}
                          className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition ${
                            isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-base-300 hover:bg-base-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm pointer-events-none"
                            checked={isSelected}
                            readOnly
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                          {formatClockRange(window.startsAt, window.endsAt)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="border-t border-base-300 px-3 py-2 text-xs text-base-content/60">
        {selectedIds.length} selected from {personName}
        {selectedIds.length > 0 ? ' (including other weeks)' : ''}
      </p>
    </div>
  )
}
