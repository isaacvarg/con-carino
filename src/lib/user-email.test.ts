import { describe, expect, it } from 'vitest'
import { normalizeEmail, parseEmailInput } from '#/lib/user-email'

describe('normalizeEmail', () => {
  it('trims and lowercases like Auth.js does for magic-link identifiers', () => {
    expect(normalizeEmail('  Carlos@Example.COM ')).toBe('carlos@example.com')
  })
})

describe('parseEmailInput', () => {
  it('returns the normalized address', () => {
    expect(parseEmailInput(' Carlos@Example.com')).toBe('carlos@example.com')
  })

  it('rejects empty and non-string input', () => {
    expect(() => parseEmailInput('  ')).toThrow('Email is required.')
    expect(() => parseEmailInput(undefined)).toThrow('Email is required.')
  })

  it('rejects things that are not addresses', () => {
    expect(() => parseEmailInput('carlos')).toThrow()
    expect(() => parseEmailInput('carlos@localhost')).toThrow()
    expect(() => parseEmailInput('a b@example.com')).toThrow()
  })
})
