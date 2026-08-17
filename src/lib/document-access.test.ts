import { describe, expect, it } from 'vitest'
import { canDeleteDocument } from '#/lib/document-access'

const OWNER = 'owner-user'
const OTHER = 'other-user'

describe('canDeleteDocument', () => {
  it('lets the uploader delete their own document', () => {
    expect(
      canDeleteDocument(OWNER, { userId: OWNER, isAdmin: false }),
    ).toBe(true)
  })

  it('refuses a non-admin who did not upload the document', () => {
    expect(
      canDeleteDocument(OWNER, { userId: OTHER, isAdmin: false }),
    ).toBe(false)
  })

  it('lets an admin delete someone else’s document', () => {
    expect(
      canDeleteDocument(OWNER, { userId: OTHER, isAdmin: true }),
    ).toBe(true)
  })

  it('lets an admin delete a document they uploaded', () => {
    expect(
      canDeleteDocument(OWNER, { userId: OWNER, isAdmin: true }),
    ).toBe(true)
  })
})
