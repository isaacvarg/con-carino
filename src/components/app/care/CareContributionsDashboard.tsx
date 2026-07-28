import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type {
  CareContributionsOverviewDto,
  CareScheduledContributionDto,
} from '#/server/care'
import { confirmContribution, skipContribution } from '#/server/care'

type Props = {
  overview: CareContributionsOverviewDto
}

function money(value: string): string {
  return `$${Number(value).toFixed(2)}`
}

/**
 * Explain how a transfer amount was reached. The base is this cadence's share
 * of the planned budget; the carried balance is whatever the last close left
 * outstanding.
 */
function breakdown(row: CareScheduledContributionDto): string | null {
  const carried = Number(row.carriedBalance)
  if (Math.abs(carried) < 0.005) return null
  const base = Number(row.baseAmount)
  const verb = carried > 0 ? 'short' : 'credit'
  return `${money(row.baseAmount)} base ${carried > 0 ? '+' : '−'} ${money(String(Math.abs(carried)))} ${verb}${
    base + carried < 0 ? ' (nothing due)' : ''
  }`
}

export function CareContributionsDashboard({ overview }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(id: string, kind: 'confirm' | 'skip') {
    setBusyId(id)
    setError(null)
    try {
      if (kind === 'confirm') await confirmContribution({ data: { id } })
      else await skipContribution({ data: { id } })
      await router.invalidate()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update the contribution.',
      )
    } finally {
      setBusyId(null)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const dueNow = overview.upcoming.filter((r) => r.dueOn <= today)
  const later = overview.upcoming.filter((r) => r.dueOn > today)

  return (
    <div className="flex flex-col gap-4">
      {!overview.coverageAccountId ? (
        <div className="alert alert-warning text-sm">
          No coverage account is set, so contributions cannot be transferred.
          Choose one under Settings → Contributions.
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h2 className="text-lg font-semibold">Balances</h2>
          {overview.profiles.length === 0 ? (
            <p className="text-sm text-base-content/50">
              No contributors configured yet.
            </p>
          ) : (
            <ul className="divide-y divide-base-300">
              {overview.profiles.map((p) => {
                const n = Number(p.balance)
                return (
                  <li
                    key={p.carePersonId}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span className="font-medium">{p.carePersonName}</span>
                    <span
                      className={`tabular-nums text-sm ${
                        Math.abs(n) < 0.005
                          ? 'text-base-content/50'
                          : n > 0
                            ? 'text-warning'
                            : 'text-success'
                      }`}
                    >
                      {Math.abs(n) < 0.005
                        ? 'Settled up'
                        : n > 0
                          ? `Owes $${n.toFixed(2)}`
                          : `Credit $${Math.abs(n).toFixed(2)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h2 className="text-lg font-semibold">Due now</h2>
          {dueNow.length === 0 ? (
            <p className="text-sm text-base-content/50">Nothing due.</p>
          ) : (
            <ul className="divide-y divide-base-300">
              {dueNow.map((row) => {
                const detail = breakdown(row)
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {row.carePersonName} — {money(row.amount)}
                      </p>
                      <p className="text-xs text-base-content/60">
                        due {row.dueOn}
                        {detail ? ` · ${detail}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, 'skip')}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, 'confirm')}
                      >
                        {busyId === row.id ? 'Working…' : 'Confirm transfer'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {later.length === 0 ? (
            <p className="text-sm text-base-content/50">
              Nothing scheduled in the next few weeks.
            </p>
          ) : (
            <ul className="divide-y divide-base-300">
              {later.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {row.carePersonName}
                    <span className="ml-2 text-base-content/50">
                      {row.dueOn}
                    </span>
                  </span>
                  <span className="tabular-nums">{money(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3">
          <h2 className="text-lg font-semibold">Funding periods</h2>
          {overview.periods.length === 0 ? (
            <p className="text-sm text-base-content/50">
              No periods yet. One opens automatically.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="text-right">Budget</th>
                    <th className="text-right">Actual</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.periods.map((p) => {
                    const over =
                      p.actualCost !== null &&
                      Number(p.actualCost) > Number(p.plannedBudget)
                    return (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">
                          {p.periodStart} → {p.periodEnd}
                        </td>
                        <td className="text-right tabular-nums">
                          {money(p.plannedBudget)}
                        </td>
                        <td
                          className={`text-right tabular-nums ${over ? 'text-warning' : ''}`}
                        >
                          {p.actualCost === null ? '—' : money(p.actualCost)}
                        </td>
                        <td>
                          <span
                            className={`badge badge-sm ${
                              p.status === 'CLOSED'
                                ? 'badge-ghost'
                                : 'badge-primary'
                            }`}
                          >
                            {p.status === 'CLOSED' ? 'Closed' : 'Open'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {overview.recent.length > 0 ? (
        <section className="card border border-base-300 bg-base-100">
          <div className="card-body gap-3">
            <h2 className="text-lg font-semibold">Recent</h2>
            <ul className="divide-y divide-base-300">
              {overview.recent.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {row.carePersonName}
                    <span className="ml-2 text-base-content/50">
                      {row.dueOn}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{money(row.amount)}</span>
                    <span
                      className={`badge badge-sm ${
                        row.status === 'POSTED' ? 'badge-success' : 'badge-ghost'
                      }`}
                    >
                      {row.status === 'POSTED' ? 'Transferred' : 'Skipped'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  )
}
