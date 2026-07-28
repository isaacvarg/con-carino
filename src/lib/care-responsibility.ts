export type CareOccurrenceStatusShape = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export type HireableOccurrence = {
  assigneeId: string | null
  status: CareOccurrenceStatusShape
  startsAt: Date
}

export type ResponsibilityCheck = { ok: true } | { ok: false; reason: string }

/**
 * Whether `personId` may hand this window to paid help and take sole
 * responsibility for its cost.
 *
 * Deliberately shaped like `canReleaseOccurrence` in care-release.ts so the
 * schedule UI and the server share one rule set, and deliberately a separate
 * action: releasing a window returns it to the pool at no cost to you, whereas
 * hiring someone to cover it bills the whole window to you.
 *
 * Only covers what is on the occurrence row. The checks that need the database
 * — a pending swap, a paid invoice line, whether the target is actually paid —
 * stay server-side in `hireCoverageForWindow`.
 */
export function canTakeResponsibility(
  occ: HireableOccurrence,
  personId: string | null,
  now: Date,
): ResponsibilityCheck {
  if (!personId) {
    return { ok: false, reason: 'Your account is not linked to a caregiver.' }
  }
  if (occ.assigneeId !== personId) {
    return {
      ok: false,
      reason: 'You can only hire cover for your own coverage.',
    }
  }
  if (occ.status !== 'SCHEDULED') {
    return { ok: false, reason: 'Only scheduled coverage can be handed over.' }
  }
  if (occ.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'This window has already started.' }
  }
  return { ok: true }
}
