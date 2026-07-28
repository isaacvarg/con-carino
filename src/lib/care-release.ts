export type CareOccurrenceStatusShape = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export type ReleasableOccurrence = {
  assigneeId: string | null
  status: CareOccurrenceStatusShape
  startsAt: Date
}

export type ReleaseCheck = { ok: true } | { ok: false; reason: string }

/**
 * Whether `personId` may remove themselves as the assignee of this window.
 *
 * Covers only what is visible on the occurrence row, so the schedule UI and the
 * server can share one rule set. The checks that need the database — a pending
 * swap holding the window, or a paid invoice line — stay server-side in
 * `releaseOccurrence`.
 *
 * The floor is strictly the future, deliberately tighter than the swap flow
 * (which allows earlier-today windows): you cannot walk out of a shift that has
 * already started.
 */
export function canReleaseOccurrence(
  occ: ReleasableOccurrence,
  personId: string | null,
  now: Date,
): ReleaseCheck {
  if (!personId) {
    return { ok: false, reason: 'Your account is not linked to a caregiver.' }
  }
  if (occ.assigneeId !== personId) {
    return {
      ok: false,
      reason: 'You can only remove yourself from your own coverage.',
    }
  }
  if (occ.status !== 'SCHEDULED') {
    return { ok: false, reason: 'Only scheduled coverage can be given up.' }
  }
  if (occ.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'This window has already started.' }
  }
  return { ok: true }
}
