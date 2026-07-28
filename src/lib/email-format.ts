/**
 * Formatting shared by every outgoing app email. Kept in one place so escaping
 * and window rendering cannot drift between notification kinds.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** "Sat, Jul 25 · 7:00 AM–3:00 PM", or both dates when the window spans days. */
export function formatWindow(startsAt: Date, endsAt: Date): string {
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  const sameDay =
    startsAt.getFullYear() === endsAt.getFullYear() &&
    startsAt.getMonth() === endsAt.getMonth() &&
    startsAt.getDate() === endsAt.getDate()
  if (sameDay) {
    const day = startsAt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    return `${day} · ${startsAt.toLocaleTimeString('en-US', timeOpts)}–${endsAt.toLocaleTimeString('en-US', timeOpts)}`
  }
  return `${startsAt.toLocaleString('en-US', {
    ...timeOpts,
    month: 'short',
    day: 'numeric',
  })} – ${endsAt.toLocaleString('en-US', {
    ...timeOpts,
    month: 'short',
    day: 'numeric',
  })}`
}

function dayParts(day: string): { year: number; month: number; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day,
    }
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day,
  }
}

/** Deep link to one day of the schedule. `month` is 0-based, matching the route. */
export function buildScheduleUrl(
  origin: string,
  day: string,
  tab: 'calendar' | 'swaps',
): string {
  const parts = dayParts(day)
  const params = new URLSearchParams({
    tab,
    year: String(parts.year),
    month: String(parts.month),
    day: parts.day,
  })
  return `${origin.replace(/\/$/, '')}/schedule?${params.toString()}`
}
