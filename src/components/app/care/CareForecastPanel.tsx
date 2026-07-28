import type { CareForecastDto } from '#/server/care'

type Props = {
  forecast: CareForecastDto
}

function money(value: string): string {
  return `$${Number(value).toFixed(2)}`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Forward view of care cost. Nothing here is settleable — these are repriced
 * future windows, not invoices, and the schedule can still change.
 */
export function CareForecastPanel({ forecast }: Props) {
  const hasAnything =
    forecast.pricedShifts > 0 ||
    forecast.unassignedShifts > 0 ||
    forecast.unpaidShifts > 0

  return (
    <section className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Upcoming</h2>
            <p className="text-sm text-base-content/60">
              {shortDate(forecast.rangeStart)} – {shortDate(forecast.rangeEnd)}
              {' · projected, not yet billable'}
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums">
            {money(forecast.totalCost)}
          </p>
        </div>

        {!hasAnything ? (
          <p className="text-sm text-base-content/50">
            No coverage scheduled in this window.
          </p>
        ) : (
          <>
            {forecast.unassignedShifts > 0 ? (
              <div className="alert alert-warning text-sm">
                <span>
                  {forecast.unassignedShifts} unfilled{' '}
                  {forecast.unassignedShifts === 1 ? 'window' : 'windows'} in
                  this range. They are not priced — the total will grow if paid
                  help covers them.
                </span>
              </div>
            ) : null}

            {forecast.warnings.map((w) => (
              <div key={w} className="alert alert-info text-sm">
                <span>{w}</span>
              </div>
            ))}

            {forecast.byCaregiver.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-base-content/70">
                  Expected cost by caregiver
                </h3>
                <ul className="mt-2 divide-y divide-base-300">
                  {forecast.byCaregiver.map((c) => (
                    <li
                      key={c.personId}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span>
                        {c.personName}
                        <span className="ml-2 text-base-content/50">
                          {c.shifts} {c.shifts === 1 ? 'shift' : 'shifts'}
                        </span>
                      </span>
                      <span className="tabular-nums">{money(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {forecast.shares.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-base-content/70">
                  Projected share per contributor
                </h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th className="text-right">Hired cover</th>
                        <th className="text-right">Share of pool</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.shares.map((s) => (
                        <tr key={s.personId}>
                          <td>{s.personName}</td>
                          <td className="text-right tabular-nums">
                            {Number(s.carveOut) > 0 ? money(s.carveOut) : '—'}
                          </td>
                          <td className="text-right tabular-nums">
                            {money(s.poolShare)}
                          </td>
                          <td className="text-right font-medium tabular-nums">
                            {money(s.amountDue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {forecast.unpaidShifts > 0 ? (
              <p className="text-xs text-base-content/50">
                {forecast.unpaidShifts} further{' '}
                {forecast.unpaidShifts === 1 ? 'window is' : 'windows are'}{' '}
                covered by family at no cost.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
