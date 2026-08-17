/**
 * Who may approve or decline an off-schedule hire request.
 *
 * Linked employees answer for themselves. Offline employees cannot, so any
 * admin may settle after confirming in person — no admin-mode toggle required,
 * unlike swaps, where anyone can act for an offline caregiver.
 *
 * Admin mode (settling a request you are not otherwise allowed to) lives on
 * the server next to `resolveAdminOverride`, not here.
 */
export function canReviewHire(
  row: { status: string; targetUserId: string | null },
  viewer: { userId: string; isAdmin: boolean },
): boolean {
  if (row.status !== 'PENDING') return false
  if (row.targetUserId) return row.targetUserId === viewer.userId
  return viewer.isAdmin
}

export function canCancelHire(
  row: { status: string; requestedByUserId: string },
  viewerUserId: string,
): boolean {
  if (row.status !== 'PENDING') return false
  return row.requestedByUserId === viewerUserId
}
