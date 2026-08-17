import { describe, expect, it } from 'vitest'
import { canCancelHire, canReviewHire } from '#/lib/care-hire'

const PENDING = {
  status: 'PENDING',
  targetUserId: 'emp-user',
  requestedByUserId: 'family-user',
}

describe('canReviewHire', () => {
  it('lets a linked employee approve their own pending request', () => {
    expect(
      canReviewHire(PENDING, { userId: 'emp-user', isAdmin: false }),
    ).toBe(true)
  })

  it('refuses a non-admin who is not the employee', () => {
    expect(
      canReviewHire(PENDING, { userId: 'family-user', isAdmin: false }),
    ).toBe(false)
  })

  it('refuses a non-admin even for an offline employee', () => {
    expect(
      canReviewHire(
        { ...PENDING, targetUserId: null },
        { userId: 'family-user', isAdmin: false },
      ),
    ).toBe(false)
  })

  it('lets any admin approve for an offline employee', () => {
    expect(
      canReviewHire(
        { ...PENDING, targetUserId: null },
        { userId: 'admin-user', isAdmin: true },
      ),
    ).toBe(true)
  })

  it('does not let an admin approve an online employee without admin mode', () => {
    expect(
      canReviewHire(PENDING, { userId: 'admin-user', isAdmin: true }),
    ).toBe(false)
  })

  it('refuses a request that is no longer pending', () => {
    expect(
      canReviewHire(
        { ...PENDING, status: 'APPROVED' },
        { userId: 'emp-user', isAdmin: false },
      ),
    ).toBe(false)
  })
})

describe('canCancelHire', () => {
  it('lets the person who asked cancel a pending request', () => {
    expect(canCancelHire(PENDING, 'family-user')).toBe(true)
  })

  it('refuses anyone else', () => {
    expect(canCancelHire(PENDING, 'emp-user')).toBe(false)
  })

  it('refuses once the request is settled', () => {
    expect(canCancelHire({ ...PENDING, status: 'REJECTED' }, 'family-user')).toBe(
      false,
    )
  })
})
