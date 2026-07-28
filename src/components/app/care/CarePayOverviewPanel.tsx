import { HiChevronLeft, HiChevronRight } from 'react-icons/hi'
import { Tabs } from '#/components/app/ui/Tabs'
import type { PayOverviewMode } from '#/lib/care-pay-period'
import type { CarePayOverviewDto } from '#/server/care'

type CarePayOverviewPanelProps = {
  overview: CarePayOverviewDto
  onModeChange: (mode: PayOverviewMode) => void
  onOffsetChange: (offset: number) => void
}

const MODE_TABS: Array<{ id: PayOverviewMode; label: string }> = [
  { id: 'WEEKLY', label: 'Weekly' },
  { id: 'MONTHLY', label: 'Monthly' },
]

function money(value: string): string {
  return `$${Number(value).toFixed(2)}`
}

/**
 * Simple invoicing: what each paid caregiver should be paid for one period.
 *
 * Deliberately inert — there is nothing to settle, approve, or void here. The
 * figures are recomputed from the schedule on every load, so they follow the
 * calendar rather than needing to be kept in sync with it.
 */
export function CarePayOverviewPanel({
  overview,
  onModeChange,
  onOffsetChange,
}: CarePayOverviewPanelProps) {
  const periodNoun = overview.mode === 'WEEKLY' ? 'week' : 'month'

  return (
    <section className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pay overview</h2>
            <p className="text-sm text-base-content/60">
              What each paid caregiver should be paid this {periodNoun}.
            </p>
          </div>
          <Tabs
            tabs={MODE_TABS}
            value={overview.mode}
            onChange={(mode) => onModeChange(mode)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-base-300 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => onOffsetChange(overview.offset - 1)}
              aria-label={`Previous ${periodNoun}`}
            >
              <HiChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="min-w-40 text-center text-sm font-medium">
              {overview.label}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => onOffsetChange(overview.offset + 1)}
              aria-label={`Next ${periodNoun}`}
            >
              <HiChevronRight className="size-4" aria-hidden />
            </button>
            {overview.offset !== 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onOffsetChange(0)}
              >
                Today
              </button>
            ) : null}
          </div>
          <p className="text-2xl font-semibold tabular-nums">
            {money(overview.totalCost)}
          </p>
        </div>

        {overview.byCaregiver.length === 0 ? (
          <p className="text-sm text-base-content/50">
            No paid coverage in this {periodNoun}.
          </p>
        ) : (
          <ul className="divide-y divide-base-300">
            {overview.byCaregiver.map((c) => (
              <li
                key={c.personId}
                className="flex items-center justify-between gap-2 py-2.5 text-sm"
              >
                <span className="font-medium text-base-content">
                  {c.personName}
                </span>
                <span className="flex items-baseline gap-4">
                  <span className="text-base-content/50">
                    {c.shifts} {c.shifts === 1 ? 'shift' : 'shifts'}
                  </span>
                  <span className="min-w-24 text-right font-semibold tabular-nums">
                    {money(c.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {overview.unassignedShifts > 0 ? (
          <div className="alert alert-warning text-sm">
            <span>
              {overview.unassignedShifts} unfilled{' '}
              {overview.unassignedShifts === 1 ? 'window' : 'windows'} in this{' '}
              {periodNoun}. They are not priced — the total will grow if paid
              help covers them.
            </span>
          </div>
        ) : null}

        {overview.unpaidShifts > 0 ? (
          <p className="text-xs text-base-content/50">
            {overview.unpaidShifts}{' '}
            {overview.unpaidShifts === 1 ? 'window is' : 'windows are'} covered
            by family at no cost.
          </p>
        ) : null}
      </div>
    </section>
  )
}
