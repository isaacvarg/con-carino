import { describe, expect, it } from 'vitest'
import {
  canReassignOccurrence,
  canReleaseOccurrence,
} from '#/lib/care-release'

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

describe('canReleaseOccurrence with adminOverride', () => {
  it("releases someone else's window", () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: FUTURE },
        'person-b',
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: true })
  })

  it('releases a window that has already started', () => {
    // The usual reason to need the override is a caregiver who has gone
    // silent mid-shift, so lifting ownership without lifting the time floor
    // would not actually help.
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: PAST },
        'person-b',
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: true })
  })

  it('works for an admin with no caregiver record of their own', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: FUTURE },
        null,
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: true })
  })

  it('still refuses a window that is not scheduled', () => {
    // A cancelled or completed window is not a scheduling problem, so there is
    // nothing here for the override to rescue.
    expect(
      canReleaseOccurrence(
        { assigneeId: 'person-a', status: 'CANCELLED', startsAt: FUTURE },
        'person-b',
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: false, reason: 'Only scheduled coverage can be given up.' })
  })

  it('still refuses an already-open window', () => {
    expect(
      canReleaseOccurrence(
        { assigneeId: null, status: 'SCHEDULED', startsAt: FUTURE },
        'person-b',
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: false, reason: 'This window is already open.' })
  })

  it('changes nothing when the override is absent or false', () => {
    const occ = {
      assigneeId: 'person-a',
      status: 'SCHEDULED' as const,
      startsAt: FUTURE,
    }
    expect(canReleaseOccurrence(occ, 'person-b', NOW, {})).toEqual(
      canReleaseOccurrence(occ, 'person-b', NOW),
    )
    expect(
      canReleaseOccurrence(occ, 'person-b', NOW, { adminOverride: false }).ok,
    ).toBe(false)
  })
})

describe('canReassignOccurrence', () => {
  const open = { assigneeId: null, status: 'SCHEDULED' as const }
  const mine = { assigneeId: 'person-a', status: 'SCHEDULED' as const }
  const theirs = { assigneeId: 'person-b', status: 'SCHEDULED' as const }

  it('lets anyone fill an open slot, for anyone', () => {
    // Matches what the calendar has always allowed: the bulk-claim bar offers
    // every active person, not just yourself.
    expect(canReassignOccurrence(open, 'person-a')).toEqual({ ok: true })
    expect(canReassignOccurrence(open, null)).toEqual({ ok: true })
  })

  it('lets you move your own window', () => {
    expect(canReassignOccurrence(mine, 'person-a')).toEqual({ ok: true })
  })

  it("refuses someone else's window", () => {
    expect(canReassignOccurrence(theirs, 'person-a')).toEqual({
      ok: false,
      reason:
        'This window belongs to someone else. Request a swap, or ask an admin.',
    })
  })

  it("refuses an unlinked user on someone else's window", () => {
    expect(canReassignOccurrence(theirs, null).ok).toBe(false)
  })

  it("allows someone else's window under adminOverride", () => {
    expect(
      canReassignOccurrence(theirs, 'person-a', { adminOverride: true }),
    ).toEqual({ ok: true })
  })

  it('refuses a non-scheduled window even under adminOverride', () => {
    expect(
      canReassignOccurrence(
        { assigneeId: 'person-b', status: 'COMPLETED' },
        'person-a',
        { adminOverride: true },
      ),
    ).toEqual({
      ok: false,
      reason: 'Only scheduled coverage can be reassigned.',
    })
  })
})
