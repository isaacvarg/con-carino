/** Parsers for URL search params backing table and grid state. */

export function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

/** Normalizes a CSV param, dropping blank entries. */
export function parseCsvParam(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',')
}

export function parseCsvValues(value: string): string[] {
  if (!value.trim()) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function serializeCsvValues(values: string[]): string {
  return values.filter(Boolean).join(',')
}
