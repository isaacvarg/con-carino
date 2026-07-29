export type CareOccurrenceStatusShape = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export type ReleasableOccurrence = {
  assigneeId: string | null
  status: CareOccurrenceStatusShape
  startsAt: Date
}

export type ReleaseCheck = { ok: true } | { ok: false; reason: string }

/**
 * Set when an admin is deliberately acting outside the normal rules.
 *
 * Never inferred from "the caller happens to be an admin": an admin doing their
 * own scheduling should hit exactly the same walls as everyone else. The
 * override is opt-in, per action, and recorded in the activity log.
 */
export type AdminOverrideOptions = { adminOverride?: boolean }

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
 *
 * With `adminOverride`, both the ownership rule and the already-started floor
 * are lifted — that pairing is the point of the override, since the usual
 * reason to need it is a caregiver who has gone silent mid-shift. The status
 * check stays: a cancelled or completed window is not a scheduling problem.
 */
export function canReleaseOccurrence(
  occ: ReleasableOccurrence,
  personId: string | null,
  now: Date,
  options: AdminOverrideOptions = {},
): ReleaseCheck {
  const admin = options.adminOverride === true

  if (!admin) {
    if (!personId) {
      return { ok: false, reason: 'Your account is not linked to a caregiver.' }
    }
    if (occ.assigneeId !== personId) {
      return {
        ok: false,
        reason: 'You can only remove yourself from your own coverage.',
      }
    }
  }
  if (occ.status !== 'SCHEDULED') {
    return { ok: false, reason: 'Only scheduled coverage can be given up.' }
  }
  if (!admin && occ.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'This window has already started.' }
  }
  if (admin && !occ.assigneeId) {
    return { ok: false, reason: 'This window is already open.' }
  }
  return { ok: true }
}

export type ReassignableOccurrence = {
  assigneeId: string | null
  status: CareOccurrenceStatusShape
}

/**
 * Whether `personId` may change who covers this window.
 *
 * Codifies what the calendar has always allowed: an *open* slot is a free-for-
 * all that anyone can fill for anyone, while a window that already belongs to
 * someone is theirs — everyone else has to ask, via the swap flow. Until now
 * that rule lived only in the component, so `updateOccurrence` would honour a
 * hand-crafted request to reassign anybody's shift.
 */
export function canReassignOccurrence(
  occ: ReassignableOccurrence,
  personId: string | null,
  options: AdminOverrideOptions = {},
): ReleaseCheck {
  if (occ.status !== 'SCHEDULED') {
    return { ok: false, reason: 'Only scheduled coverage can be reassigned.' }
  }
  if (options.adminOverride === true) return { ok: true }
  // An open slot belongs to nobody, so there is nobody to take it from.
  if (!occ.assigneeId) return { ok: true }
  if (personId && occ.assigneeId === personId) return { ok: true }
  return {
    ok: false,
    reason:
      'This window belongs to someone else. Request a swap, or ask an admin.',
  }
}
