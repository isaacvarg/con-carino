/**
 * Hand-rolled payload validators shared by `createServerFn().validator(...)`
 * handlers. Pure functions only — anything needing the request lives server-side.
 */

export function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function requireName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) {
    throw new Error('Name is required.')
  }
  return name
}

export function requireId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) {
    throw new Error('Id is required.')
  }
  return id
}

/**
 * Requires a 6-digit hex color and normalizes it to lowercase. Stricter than
 * `isValidHexColor` in taxonomy-badge.ts, which also accepts the 3-digit form
 * because it only has to render.
 */
export function requireHexColor(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new Error(`${label} must be a hex color like #1d4ed8.`)
  }
  return value.trim().toLowerCase()
}
