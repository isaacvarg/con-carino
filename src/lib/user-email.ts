/**
 * Sign-in address handling shared by the alias admin UI, the user merge, and
 * the alias-aware adapter in src/utils/auth.ts. Pure functions only.
 */

/**
 * Same normalization Auth.js applies to a magic-link identifier before it
 * looks the user up, so an alias stored through here always matches.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Loose shape check: one @, something on both sides, a dot in the domain. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseEmailInput(value: unknown): string {
  const email = typeof value === 'string' ? normalizeEmail(value) : ''
  if (!email) throw new Error('Email is required.')
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Enter a valid email address.')
  }
  return email
}
