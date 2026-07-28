/**
 * Splitting a period's care cost across contributors.
 *
 * All arithmetic happens in integer 4dp units. There is exactly one floating
 * multiply — computing each raw share — and everything after it is integer
 * work, which is what makes "the allocations sum to the total exactly" a
 * structural property rather than a rounding accident.
 */

export type ContributionBasis = 'PERCENT' | 'FIXED'
export type SplitPolicy = 'FIXED_FIRST_THEN_PERCENT' | 'BACKSTOP'

export type ContributorProfile = {
  personId: string
  basis: ContributionBasis
  /** 0–100. Used when basis is PERCENT. */
  percent: number | null
  /** Currency amount. Used when basis is FIXED. */
  fixedAmount: number | null
}

export type CarveOut = {
  personId: string
  /** Cost of windows this person is solely responsible for. */
  amount: number
}

export type AllocationInput = {
  periodTotal: number
  carveOuts: CarveOut[]
  contributors: ContributorProfile[]
  policy: SplitPolicy
  backstopPersonId: string | null
}

export type AllocationWarning =
  | 'fixed-exceeds-pool'
  | 'no-percent-contributors'
  | 'no-percent-contributors-used-backstop'
  | 'no-backstop'
  | 'no-contributors'

export type Allocation = {
  personId: string
  /** Solely-responsible cost, billed on top of any pooled share. */
  carveOut: number
  /** This person's share of what remains after carve-outs. */
  poolShare: number
  amountDue: number
}

export type AllocationResult = {
  allocations: Allocation[]
  /** Total after carve-outs are removed — what the policy actually splits. */
  pooled: number
  /** Non-zero only alongside a warning; never silently discarded. */
  unallocated: number
  warnings: AllocationWarning[]
}

const SCALE = 10_000

function toUnits(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error('Amount is not a finite number.')
  return Math.round(amount * SCALE)
}

function fromUnits(units: number): number {
  return Math.round(units) / SCALE
}

/**
 * Largest-remainder (Hamilton) apportionment of `totalUnits` across `weights`.
 *
 * Ties break on personId, not array order. That matters: re-closing a period
 * must hand the same leftover penny to the same person, or every re-close would
 * emit spurious true-up entries for a difference nobody made.
 */
function apportion(
  totalUnits: number,
  entries: Array<{ personId: string; weight: number }>,
): Map<string, number> {
  const result = new Map<string, number>()
  const weightSum = entries.reduce((s, e) => s + e.weight, 0)
  if (entries.length === 0 || weightSum <= 0) return result

  const raw = entries.map((e) => ({
    personId: e.personId,
    exact: (totalUnits * e.weight) / weightSum,
  }))

  let assigned = 0
  const floored = raw.map((r) => {
    const base = Math.floor(r.exact)
    assigned += base
    return { personId: r.personId, base, remainder: r.exact - base }
  })

  let deficit = totalUnits - assigned
  const order = [...floored].sort(
    (a, b) =>
      b.remainder - a.remainder || (a.personId < b.personId ? -1 : 1),
  )
  for (let i = 0; deficit > 0 && i < order.length; i += 1, deficit -= 1) {
    order[i]!.base += 1
  }
  // Negative totals floor away from zero, so the correction can run the other way.
  for (let i = order.length - 1; deficit < 0 && i >= 0; i -= 1, deficit += 1) {
    order[i]!.base -= 1
  }

  for (const row of floored) result.set(row.personId, row.base)
  return result
}

/**
 * Work out what each person owes for a period.
 *
 * Carve-outs come off the top: a window someone hired cover for is billed
 * wholly to them and never reaches the shared pool. Whatever remains is split
 * by the configured policy.
 */
export function allocateCarePeriod(input: AllocationInput): AllocationResult {
  const warnings: AllocationWarning[] = []
  const totalUnits = toUnits(input.periodTotal)

  const carveByPerson = new Map<string, number>()
  for (const carve of input.carveOuts) {
    carveByPerson.set(
      carve.personId,
      (carveByPerson.get(carve.personId) ?? 0) + toUnits(carve.amount),
    )
  }
  const carveUnits = [...carveByPerson.values()].reduce((s, v) => s + v, 0)
  if (carveUnits > totalUnits) {
    throw new Error('Sole-responsibility carve-outs exceed the period total.')
  }
  const pooledUnits = totalUnits - carveUnits

  const fixed = input.contributors.filter((c) => c.basis === 'FIXED')
  const percent = input.contributors.filter((c) => c.basis === 'PERCENT')

  const shareUnits = new Map<string, number>()
  let unallocatedUnits = 0

  if (input.contributors.length === 0) {
    if (pooledUnits !== 0) {
      unallocatedUnits = pooledUnits
      warnings.push('no-contributors')
    }
  } else if (input.policy === 'FIXED_FIRST_THEN_PERCENT') {
    const fixedEntries = fixed.map((c) => ({
      personId: c.personId,
      weight: Math.max(0, toUnits(c.fixedAmount ?? 0)),
    }))
    const fixedTotal = fixedEntries.reduce((s, e) => s + e.weight, 0)

    if (fixedTotal >= pooledUnits) {
      // Fixed pledges alone cover (or overshoot) the pool: scale them down
      // proportionally so the total still lands exactly on the pool.
      warnings.push('fixed-exceeds-pool')
      for (const [personId, units] of apportion(pooledUnits, fixedEntries)) {
        shareUnits.set(personId, units)
      }
      for (const c of percent) shareUnits.set(c.personId, 0)
    } else {
      for (const entry of fixedEntries) {
        shareUnits.set(entry.personId, entry.weight)
      }
      const remainderUnits = pooledUnits - fixedTotal
      const percentEntries = percent.map((c) => ({
        personId: c.personId,
        weight: Math.max(0, c.percent ?? 0),
      }))
      const percentWeight = percentEntries.reduce((s, e) => s + e.weight, 0)

      if (percentWeight <= 0) {
        if (remainderUnits !== 0) {
          if (input.backstopPersonId) {
            warnings.push('no-percent-contributors-used-backstop')
            shareUnits.set(
              input.backstopPersonId,
              (shareUnits.get(input.backstopPersonId) ?? 0) + remainderUnits,
            )
          } else {
            warnings.push('no-percent-contributors')
            unallocatedUnits = remainderUnits
          }
        }
        for (const c of percent) {
          if (!shareUnits.has(c.personId)) shareUnits.set(c.personId, 0)
        }
      } else {
        // Percentages are renormalised against each other, so they always
        // consume the whole remainder even when they do not sum to 100.
        for (const [personId, units] of apportion(
          remainderUnits,
          percentEntries,
        )) {
          shareUnits.set(personId, units)
        }
      }
    }
  } else {
    // BACKSTOP: percentages and fixed amounts are taken literally, and one
    // nominated person absorbs whatever is left over or short.
    let assigned = 0
    for (const c of fixed) {
      const units = toUnits(c.fixedAmount ?? 0)
      shareUnits.set(c.personId, units)
      assigned += units
    }
    for (const c of percent) {
      const units = Math.round((pooledUnits * Math.max(0, c.percent ?? 0)) / 100)
      shareUnits.set(c.personId, (shareUnits.get(c.personId) ?? 0) + units)
      assigned += units
    }
    const residual = pooledUnits - assigned
    if (residual !== 0) {
      if (input.backstopPersonId) {
        // A negative residual is legitimate and must stay visible: it means the
        // others over-fund and the backstop is owed money.
        shareUnits.set(
          input.backstopPersonId,
          (shareUnits.get(input.backstopPersonId) ?? 0) + residual,
        )
      } else {
        warnings.push('no-backstop')
        unallocatedUnits = residual
      }
    }
  }

  const personIds = new Set<string>([
    ...input.contributors.map((c) => c.personId),
    ...carveByPerson.keys(),
    ...shareUnits.keys(),
  ])

  const allocations: Allocation[] = [...personIds]
    .sort()
    .map((personId) => {
      const carve = carveByPerson.get(personId) ?? 0
      const share = shareUnits.get(personId) ?? 0
      return {
        personId,
        carveOut: fromUnits(carve),
        poolShare: fromUnits(share),
        amountDue: fromUnits(carve + share),
      }
    })

  const sumUnits = allocations.reduce((s, a) => s + toUnits(a.amountDue), 0)
  if (sumUnits + unallocatedUnits !== totalUnits) {
    throw new Error(
      `Allocation does not balance: ${sumUnits + unallocatedUnits} vs ${totalUnits}.`,
    )
  }

  return {
    allocations,
    pooled: fromUnits(pooledUnits),
    unallocated: fromUnits(unallocatedUnits),
    warnings,
  }
}
