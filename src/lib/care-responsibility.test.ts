import { describe, expect, it } from 'vitest'
import {
  canTakeResponsibility,
  type HireableOccurrence,
} from '#/lib/care-responsibility'

const NOW = new Date('2026-07-28T12:00:00Z')
const FUTURE = new Date('2026-07-29T12:00:00Z')
const PAST = new Date('2026-07-27T12:00:00Z')

function occ(over: Partial<HireableOccurrence> = {}): HireableOccurrence {
  return {
    assigneeId: 'person-1',
    status: 'SCHEDULED',
    startsAt: FUTURE,
    ...over,
  }
}

describe('canTakeResponsibility', () => {
  it('allows the assignee to hire cover for a future scheduled window', () => {
    expect(canTakeResponsibility(occ(), 'person-1', NOW)).toEqual({ ok: true })
  })

  it('rejects a caller with no linked person', () => {
    const res = canTakeResponsibility(occ(), null, NOW)
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ reason: expect.stringMatching(/not linked/) })
  })

  it('rejects someone who is not the assignee', () => {
    const res = canTakeResponsibility(occ(), 'person-2', NOW)
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ reason: expect.stringMatching(/your own/) })
  })

  it('rejects an unassigned window', () => {
    const res = canTakeResponsibility(occ({ assigneeId: null }), 'person-1', NOW)
    expect(res.ok).toBe(false)
  })

  it('rejects a completed or cancelled window', () => {
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      const res = canTakeResponsibility(occ({ status }), 'person-1', NOW)
      expect(res.ok).toBe(false)
      expect(res).toMatchObject({ reason: expect.stringMatching(/scheduled/i) })
    }
  })

  it('rejects a window that has already started', () => {
    const res = canTakeResponsibility(occ({ startsAt: PAST }), 'person-1', NOW)
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ reason: expect.stringMatching(/already started/) })
  })

  it('rejects a window starting exactly now', () => {
    const res = canTakeResponsibility(occ({ startsAt: NOW }), 'person-1', NOW)
    expect(res.ok).toBe(false)
  })
})

describe('canTakeResponsibility with adminOverride', () => {
  it("acts on someone else's window, including one already under way", () => {
    expect(
      canTakeResponsibility(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: FUTURE },
        'person-b',
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: true })
    expect(
      canTakeResponsibility(
        { assigneeId: 'person-a', status: 'SCHEDULED', startsAt: PAST },
        'person-b',
        NOW,
        { adminOverride: true },
      ),
    ).toEqual({ ok: true })
  })

  it('still refuses a window that is not scheduled', () => {
    expect(
      canTakeResponsibility(
        { assigneeId: 'person-a', status: 'COMPLETED', startsAt: FUTURE },
        'person-b',
        NOW,
        { adminOverride: true },
      ).ok,
    ).toBe(false)
  })
})
