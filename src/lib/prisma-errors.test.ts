import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '#/lib/prisma-errors'

describe('isUniqueViolation', () => {
  it('matches a P2002 error object', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true)
    expect(isUniqueViolation(Object.assign(new Error('dup'), { code: 'P2002' }))).toBe(
      true,
    )
  })

  it('rejects other prisma codes and non-errors', () => {
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('P2002')).toBe(false)
  })
})
