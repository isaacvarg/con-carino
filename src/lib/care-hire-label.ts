export const DEFAULT_HIRE_CALENDAR_LABEL =
  '%originalUser hired %employedUser'

const ORIGINAL_TOKEN = '%originalUser'
const EMPLOYED_TOKEN = '%employedUser'

/**
 * Fill a household calendar-hire template. Unknown tokens are left as-is.
 * An empty template falls back to the employed person's name so a chip never
 * renders blank.
 */
export function formatHireCalendarLabel(
  template: string,
  names: { originalUser: string; employedUser: string },
): string {
  const trimmed = template.trim()
  if (!trimmed) return names.employedUser
  return trimmed
    .replaceAll(ORIGINAL_TOKEN, names.originalUser)
    .replaceAll(EMPLOYED_TOKEN, names.employedUser)
}
