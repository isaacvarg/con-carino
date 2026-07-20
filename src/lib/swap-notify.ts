export type SwapNotifyAssignee = {
  userId: string | null
  email: string | null
}

export function shouldNotifyAssignee(
  assignee: SwapNotifyAssignee,
  requestedByUserId: string,
): boolean {
  if (!assignee.userId || !assignee.email?.trim()) return false
  if (assignee.userId === requestedByUserId) return false
  return true
}

/** App origin from AUTH_URL (strip /api/auth) or a request URL fallback. */
export function resolveAppOrigin(options: {
  authUrl?: string | null
  requestUrl?: string | null
}): string | null {
  const authUrl = options.authUrl?.trim()
  if (authUrl) {
    try {
      const url = new URL(authUrl)
      return url.origin
    } catch {
      // fall through
    }
  }
  const requestUrl = options.requestUrl?.trim()
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin
    } catch {
      return null
    }
  }
  return null
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

export function buildSwapScheduleUrl(origin: string, day: string): string {
  const parts = dayParts(day)
  const params = new URLSearchParams({
    tab: 'swaps',
    year: String(parts.year),
    month: String(parts.month),
    day: parts.day,
  })
  return `${origin.replace(/\/$/, '')}/schedule?${params.toString()}`
}

function formatWindow(startsAt: Date, endsAt: Date): string {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export type SwapRequestEmailInput = {
  requesterName: string | null
  relinquishStartsAt: Date
  relinquishEndsAt: Date
  claimStartsAt: Date
  claimEndsAt: Date
  claimForPersonName: string
  notes: string | null
  scheduleUrl: string | null
  dayLabel: string
}

export function buildSwapRequestEmail(input: SwapRequestEmailInput): {
  subject: string
  text: string
  html: string
} {
  const requester = input.requesterName?.trim() || 'Someone'
  const relinquish = formatWindow(
    input.relinquishStartsAt,
    input.relinquishEndsAt,
  )
  const claim = formatWindow(input.claimStartsAt, input.claimEndsAt)
  const subject = `Swap requested for your coverage on ${input.dayLabel}`

  const lines = [
    `${requester} requested a swap involving your coverage.`,
    '',
    `Your coverage (relinquish): ${relinquish}`,
    `Open slot (claim): ${claim}`,
    `Claim for: ${input.claimForPersonName}`,
  ]
  if (input.notes?.trim()) {
    lines.push(`Notes: ${input.notes.trim()}`)
  }
  if (input.scheduleUrl) {
    lines.push('', `Review the request: ${input.scheduleUrl}`)
  } else {
    lines.push('', 'Open the Schedule → Swaps tab in the app to review.')
  }

  const text = lines.join('\n')

  const notesHtml = input.notes?.trim()
    ? `<p><strong>Notes:</strong> ${escapeHtml(input.notes.trim())}</p>`
    : ''
  const linkHtml = input.scheduleUrl
    ? `<p><a href="${escapeHtml(input.scheduleUrl)}">Review the swap request</a></p>`
    : `<p>Open the Schedule → Swaps tab in the app to review.</p>`

  const html = [
    `<p>${escapeHtml(requester)} requested a swap involving your coverage.</p>`,
    `<p><strong>Your coverage (relinquish):</strong> ${escapeHtml(relinquish)}</p>`,
    `<p><strong>Open slot (claim):</strong> ${escapeHtml(claim)}</p>`,
    `<p><strong>Claim for:</strong> ${escapeHtml(input.claimForPersonName)}</p>`,
    notesHtml,
    linkHtml,
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, text, html }
}
