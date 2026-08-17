import { describe, expect, it } from 'vitest'
import { ensureAuthUrlHasBasePath, normalizeAuthUrl } from '#/lib/auth-url'

describe('normalizeAuthUrl', () => {
  it('returns undefined when unset or blank', () => {
    expect(normalizeAuthUrl(undefined)).toBeUndefined()
    expect(normalizeAuthUrl(null)).toBeUndefined()
    expect(normalizeAuthUrl('  ')).toBeUndefined()
  })

  it('appends /api/auth when AUTH_URL is origin-only', () => {
    expect(normalizeAuthUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/api/auth',
    )
    expect(normalizeAuthUrl('http://localhost:3000/')).toBe(
      'http://localhost:3000/api/auth',
    )
    expect(normalizeAuthUrl('https://enos.example.com')).toBe(
      'https://enos.example.com/api/auth',
    )
  })

  it('leaves a URL that already includes the auth path', () => {
    expect(normalizeAuthUrl('http://localhost:3000/api/auth')).toBe(
      'http://localhost:3000/api/auth',
    )
    expect(normalizeAuthUrl('https://enos.example.com/api/auth')).toBe(
      'https://enos.example.com/api/auth',
    )
  })

  it('returns the original string when it is not a URL', () => {
    expect(normalizeAuthUrl('not-a-url')).toBe('not-a-url')
  })
})

describe('ensureAuthUrlHasBasePath', () => {
  it('mutates origin-only AUTH_URL on the given env object', () => {
    const env = { AUTH_URL: 'http://localhost:3000' }
    ensureAuthUrlHasBasePath(env)
    expect(env.AUTH_URL).toBe('http://localhost:3000/api/auth')
  })

  it('does not set AUTH_URL when it was missing', () => {
    const env: NodeJS.ProcessEnv = {}
    ensureAuthUrlHasBasePath(env)
    expect(env.AUTH_URL).toBeUndefined()
  })
})
