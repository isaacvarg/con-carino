import {
  buildScheduleUrl,
  escapeHtml,
  formatWindow,
} from '#/lib/email-format'

export type SwapNotifyParticipant = {
  userId: string | null
  email: string | null
}

/** Notify a swap participant unless they are offline, mail-less, or the actor. */
export function shouldNotifyParticipant(
  participant: SwapNotifyParticipant,
  actorUserId: string,
): boolean {
  if (!participant.userId || !participant.email?.trim()) return false
  if (participant.userId === actorUserId) return false
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

export function buildSwapScheduleUrl(origin: string, day: string): string {
  return buildScheduleUrl(origin, day, 'swaps')
}

export type SwapEmailKind = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type SwapEmailWindow = {
  startsAt: Date
  endsAt: Date
}

export type SwapEmailInput = {
  kind: SwapEmailKind
  /** User who performed the action; falls back to "Someone" */
  actorName: string | null
  /** Person taking the TAKE windows */
  requesterPersonName: string
  /** Person losing the TAKE windows */
  targetPersonName: string
  takeWindows: SwapEmailWindow[]
  giveWindows: SwapEmailWindow[]
  notes: string | null
  scheduleUrl: string | null
  dayLabel: string
}

function subjectFor(kind: SwapEmailKind, dayLabel: string): string {
  switch (kind) {
    case 'REQUESTED':
      return `Swap requested for your coverage on ${dayLabel}`
    case 'APPROVED':
      return `Your swap for ${dayLabel} was approved`
    case 'REJECTED':
      return `Your swap for ${dayLabel} was declined`
    case 'CANCELLED':
      return `A swap request for ${dayLabel} was cancelled`
  }
}

function leadFor(kind: SwapEmailKind, actor: string): string {
  switch (kind) {
    case 'REQUESTED':
      return `${actor} requested a swap involving your coverage.`
    case 'APPROVED':
      return `${actor} approved the swap. The schedule has been updated.`
    case 'REJECTED':
      return `${actor} declined the swap. Nothing on the schedule changed.`
    case 'CANCELLED':
      return `${actor} cancelled the swap request. Nothing on the schedule changed.`
  }
}

export function buildSwapEmail(input: SwapEmailInput): {
  subject: string
  text: string
  html: string
} {
  const actor = input.actorName?.trim() || 'Someone'
  const subject = subjectFor(input.kind, input.dayLabel)
  const lead = leadFor(input.kind, actor)

  const takeHeading = `${input.requesterPersonName} takes from ${input.targetPersonName}`
  const giveHeading = `${input.targetPersonName} receives from ${input.requesterPersonName}`
  const take = input.takeWindows.map((w) => formatWindow(w.startsAt, w.endsAt))
  const give = input.giveWindows.map((w) => formatWindow(w.startsAt, w.endsAt))

  const lines = [lead, '', `${takeHeading}:`]
  for (const window of take) lines.push(`  • ${window}`)
  if (give.length > 0) {
    lines.push('', `${giveHeading}:`)
    for (const window of give) lines.push(`  • ${window}`)
  } else {
    lines.push('', 'Nothing offered in exchange.')
  }
  if (input.notes?.trim()) {
    lines.push('', `Notes: ${input.notes.trim()}`)
  }
  if (input.scheduleUrl) {
    lines.push('', `View the request: ${input.scheduleUrl}`)
  } else {
    lines.push('', 'Open the Schedule → Swaps tab in the app to review.')
  }

  const text = lines.join('\n')

  const listHtml = (heading: string, windows: string[]) =>
    [
      `<p><strong>${escapeHtml(heading)}:</strong></p>`,
      `<ul>${windows.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`,
    ].join('\n')

  const giveHtml =
    give.length > 0
      ? listHtml(giveHeading, give)
      : '<p>Nothing offered in exchange.</p>'
  const notesHtml = input.notes?.trim()
    ? `<p><strong>Notes:</strong> ${escapeHtml(input.notes.trim())}</p>`
    : ''
  const linkHtml = input.scheduleUrl
    ? `<p><a href="${escapeHtml(input.scheduleUrl)}">View the swap request</a></p>`
    : `<p>Open the Schedule → Swaps tab in the app to review.</p>`

  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    listHtml(takeHeading, take),
    giveHtml,
    notesHtml,
    linkHtml,
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, text, html }
}
