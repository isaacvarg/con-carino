/**
 * How much an automation's transaction is for.
 *
 * Every result must land exactly on a cent, because it is written to a
 * `Decimal(19, 4)` column and read back as money. Doing the arithmetic in
 * integer cents is what guarantees that: `10.30 * 0.15` is `1.5449999...` in
 * binary floating point, which rounds to $1.54 while the answer a person
 * computes on paper is $1.55.
 */

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return value
}

/**
 * `percent` of `sourceMagnitude`, rounded half-up to the nearest cent.
 *
 * Half-up rather than banker's rounding: someone reading "15% of $10.10" off a
 * statement expects $1.52, and $1.51 reads as a bug even though it is the more
 * statistically even choice. Magnitudes are always positive here, so half-up
 * and half-away-from-zero are the same thing.
 */
export function percentMatchMagnitude(
  sourceMagnitude: number,
  percent: number,
): number {
  assertFinite(sourceMagnitude, 'Source amount')
  assertFinite(percent, 'Percent')

  const sourceCents = Math.round(Math.abs(sourceMagnitude) * 100)
  const cents = Math.round((sourceCents * percent) / 100)
  return cents / 100
}

/** A duplicate carries the same magnitude as its source, sign discarded. */
export function duplicateMagnitude(sourceSignedAmount: number): number {
  assertFinite(sourceSignedAmount, 'Source amount')
  return Math.round(Math.abs(sourceSignedAmount) * 100) / 100
}

/**
 * True when the computed magnitude rounded away to nothing. A $0.00
 * transaction is noise in the ledger, so the runner records a skip instead.
 */
export function roundsToZero(magnitude: number): boolean {
  return Math.round(Math.abs(magnitude) * 100) === 0
}
