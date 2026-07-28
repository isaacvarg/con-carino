import { describe, expect, it } from 'vitest'
import { canReleaseOccurrence } from '#/lib/care-release'

const NOW = new Date('2026-07-27T12:00:00')
const FUTURE = new Date('2026-07-28T09:00:00')
const PAST = new Date('2026-07-26T09:00:00')

describe('canReleaseOccurrence', () => {
  it('allows giving up your own future scheduled window', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: FUTURE },
        'person-a',
        NOW,
      ),
    ).toEqual({ ok: true })
  })

  it('rejects a user not linked to a caregiver', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: FUTURE },
        null,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'Your account is not linked to a caregiver.',
    })
  })

  it("rejects someone else's window", () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-b', status: 'SCHEDULED', startsAt: FUTURE },
        'person-a',
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'You can only remove yourself from your own coverage.',
    })
  })

  it('rejects an open slot nobody is assigned to', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: null, status: 'SCHEDULED', startsAt: FUTURE },
        'person-a',
        NOW,
      ).ok,
    ).toBe(false)
  })

  it('rejects completed and cancelled windows', () => {
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      expect(
        canReleaseOccurrence(
          { assigneeId: 'person-a', status, startsAt: FUTURE },
          'person-a',
          NOW,
        ),
      ).toEqual({
        ok: false,
        reason: 'Only scheduled coverage can be given up.',
      })
    }
  })

  it('rejects a window that has already started', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: PAST },
        'person-a',
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'This window has already started.' })
  })

  it('rejects a window starting exactly now', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: new Date(NOW) },
        'person-a',
        NOW,
      ).ok,
    ).toBe(false)
  })

  it('checks ownership before status, so the message names the real problem', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-b', status: 'COMPLETED', startsAt: PAST },
        'person-a',
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'You can only remove yourself from your own coverage.',
    })
  })
})
