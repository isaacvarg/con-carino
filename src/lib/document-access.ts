/**
 * Who may delete a library document.
 *
 * The uploader can remove their own file. Anyone else needs to be an admin —
 * the library is shared, so delete is the destructive action that is gated.
 */
export function canDeleteDocument(
  ownerUserId: string,
  viewer: { userId: string; isAdmin: boolean },
): boolean {
  return viewer.isAdmin || ownerUserId === viewer.userId
}
