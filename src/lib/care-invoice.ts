export type EffectiveRateInput = {
  personHourlyRate: number | string | null
  typeDefaultHourlyRate: number | string | null
  typeIsPaid: boolean
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

/** Effective hourly rate for a care person, or null if unpaid / no rate. */
export function effectiveHourlyRate(input: EffectiveRateInput): number | null {
  if (!input.typeIsPaid) return null
  const override = toNumber(input.personHourlyRate)
  if (override !== null && override >= 0) return override
  const fallback = toNumber(input.typeDefaultHourlyRate)
  if (fallback !== null && fallback >= 0) return fallback
  return null
}

export function computeInvoiceAmount(
  hourlyRate: number,
  hours: number,
): { amount: number; hourlyRate: number; hours: number } {
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new Error('Hourly rate is invalid.')
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('Hours must be positive.')
  }
  const amount = Math.round(hourlyRate * hours * 10_000) / 10_000
  return { amount, hourlyRate, hours }
}
