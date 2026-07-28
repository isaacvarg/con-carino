import { segmentCoverageWindow } from '#/lib/care-rate-segments'
import type { StandardSchedule } from '#/lib/care-rate-segments'
import type { CareRateType } from '#/lib/care-invoice'

/**
 * What upcoming care is going to cost.
 *
 * Derived, never persisted: this reprices future windows with the same
 * functions invoice generation uses, so a projection cannot drift from what
 * will actually be billed, and there is no stale row to clean up when the
 * schedule changes.
 *
 * Windows nobody has claimed are counted but never priced. Guessing a rate for
 * them would put a fabricated number next to real ones — the count says the
 * total could grow without pretending to know by how much.
 */

export type ForecastPerson = {
  id: string
  name: string
  /** Null when unpaid or rate-less: their coverage costs nothing. */
  rate: { amount: number; rateType: CareRateType; flatDaily: boolean } | null
  schedule: StandardSchedule
  offScheduleRate: number | null
}

export type ForecastOccurrence = {
  id: string
  startsAt: Date
  endsAt: Date
  assigneeId: string | null
  /** Set when someone hired this cover and owes all of it. */
  responsiblePersonId: string | null
}

export type ForecastPersonTotal = {
  personId: string
  personName: string
  amount: number
  shifts: number
}

export type ForecastResult = {
  /** Everything we can price. */
  totalCost: number
  byCaregiver: ForecastPersonTotal[]
  /** Sole-responsibility costs, keyed by who owes them. */
  carveOuts: Array<{ personId: string; amount: number }>
  /** Priced windows, and windows we deliberately did not price. */
  pricedShifts: number
  unassignedShifts: number
  /** Assigned to someone unpaid, so genuinely free rather than unknown. */
  unpaidShifts: number
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

export function projectCareCosts(input: {
  occurrences: ForecastOccurrence[]
  people: ForecastPerson[]
}): ForecastResult {
  const byId = new Map(input.people.map((p) => [p.id, p]))
  const totals = new Map<string, ForecastPersonTotal>()
  const carve = new Map<string, number>()

  let totalCost = 0
  let pricedShifts = 0
  let unassignedShifts = 0
  let unpaidShifts = 0

  for (const occ of input.occurrences) {
    if (occ.endsAt.getTime() <= occ.startsAt.getTime()) continue

    if (!occ.assigneeId) {
      unassignedShifts += 1
      continue
    }
    const person = byId.get(occ.assigneeId)
    if (!person || person.rate === null) {
      unpaidShifts += 1
      continue
    }

    const segments = segmentCoverageWindow({
      startsAt: occ.startsAt,
      endsAt: occ.endsAt,
      schedule: person.schedule,
      rateType: person.rate.rateType,
      flatDaily: person.rate.flatDaily,
      standardRate: person.rate.amount,
      offScheduleRate: person.offScheduleRate,
    })
    const amount = segments.reduce((s, seg) => s + seg.amount, 0)

    totalCost += amount
    pricedShifts += 1

    const existing = totals.get(person.id)
    if (existing) {
      existing.amount = round4(existing.amount + amount)
      existing.shifts += 1
    } else {
      totals.set(person.id, {
        personId: person.id,
        personName: person.name,
        amount: round4(amount),
        shifts: 1,
      })
    }

    if (occ.responsiblePersonId) {
      carve.set(
        occ.responsiblePersonId,
        round4((carve.get(occ.responsiblePersonId) ?? 0) + amount),
      )
    }
  }

  return {
    totalCost: round4(totalCost),
    byCaregiver: [...totals.values()].sort((a, b) => b.amount - a.amount),
    carveOuts: [...carve].map(([personId, amount]) => ({ personId, amount })),
    pricedShifts,
    unassignedShifts,
    unpaidShifts,
  }
}
