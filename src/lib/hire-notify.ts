import {
  buildScheduleUrl,
  escapeHtml,
  formatWindow,
} from '#/lib/email-format'

export type HireEmailKind = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type HireEmailAudience = 'target' | 'admin' | 'requester'

export type HireEmailWindow = {
  startsAt: Date
  endsAt: Date
}

export type HireEmailInput = {
  kind: HireEmailKind
  audience: HireEmailAudience
  actorName: string | null
  requesterPersonName: string
  targetPersonName: string
  windows: HireEmailWindow[]
  notes: string | null
  scheduleUrl: string | null
  dayLabel: string
}

export function buildHireScheduleUrl(origin: string, day: string): string {
  return buildScheduleUrl(origin, day, 'swaps')
}

function subjectFor(input: HireEmailInput): string {
  const { kind, audience, dayLabel, targetPersonName } = input
  if (kind === 'REQUESTED' && audience === 'admin') {
    return `Hire request for ${targetPersonName} needs in-person confirmation`
  }
  switch (kind) {
    case 'REQUESTED':
      return `Hire request for coverage on ${dayLabel}`
    case 'APPROVED':
      return `Your hire request for ${dayLabel} was approved`
    case 'REJECTED':
      return `Your hire request for ${dayLabel} was declined`
    case 'CANCELLED':
      return `A hire request for ${dayLabel} was cancelled`
  }
}

function leadFor(input: HireEmailInput, actor: string): string {
  const { kind, audience, requesterPersonName, targetPersonName } = input
  if (kind === 'REQUESTED' && audience === 'admin') {
    return `${actor} wants to hire ${targetPersonName}, who does not have an app account. Confirm with them in person, then approve on Schedule → Swaps.`
  }
  if (kind === 'REQUESTED') {
    return `${actor} wants to hire you to cover ${requesterPersonName}'s slot. You would be paid for this work.`
  }
  switch (kind) {
    case 'APPROVED':
      return `${actor} approved the hire. The schedule has been updated.`
    case 'REJECTED':
      return `${actor} declined the hire. Nothing on the schedule changed.`
    case 'CANCELLED':
      return `${actor} cancelled the hire request. Nothing on the schedule changed.`
  }
}

export function buildHireEmail(input: HireEmailInput): {
  subject: string
  text: string
  html: string
} {
  const actor = input.actorName?.trim() || 'Someone'
  const subject = subjectFor(input)
  const lead = leadFor(input, actor)
  const windows = input.windows.map((w) => formatWindow(w.startsAt, w.endsAt))

  const lines = [lead, '', 'Windows:']
  for (const window of windows) lines.push(`  • ${window}`)
  if (input.notes?.trim()) {
    lines.push('', `Notes: ${input.notes.trim()}`)
  }
  if (input.scheduleUrl) {
    lines.push('', `View the request: ${input.scheduleUrl}`)
  } else {
    lines.push('', 'Open the Schedule → Swaps tab in the app to review.')
  }

  const text = lines.join('\n')

  const notesHtml = input.notes?.trim()
    ? `<p><strong>Notes:</strong> ${escapeHtml(input.notes.trim())}</p>`
    : ''
  const linkHtml = input.scheduleUrl
    ? `<p><a href="${escapeHtml(input.scheduleUrl)}">View the hire request</a></p>`
    : `<p>Open the Schedule → Swaps tab in the app to review.</p>`

  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    `<p><strong>Windows:</strong></p>`,
    `<ul>${windows.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`,
    notesHtml,
    linkHtml,
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, text, html }
}
