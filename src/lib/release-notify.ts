import {
  buildScheduleUrl,
  escapeHtml,
  formatWindow,
} from '#/lib/email-format'

export type ReleaseEmailInput = {
  /** User who gave up the slot; falls back to "Someone" */
  actorName: string | null
  startsAt: Date
  endsAt: Date
  scheduleUrl: string | null
  /** 'YYYY-MM-DD' */
  dayLabel: string
}

/** Calendar-tab deep link for the day whose slot just opened. */
export function buildReleaseScheduleUrl(origin: string, day: string): string {
  return buildScheduleUrl(origin, day, 'calendar')
}

/** Broadcast telling everyone a caregiver stepped off a window. */
export function buildReleaseEmail(input: ReleaseEmailInput): {
  subject: string
  text: string
  html: string
} {
  const actor = input.actorName?.trim() || 'Someone'
  const subject = `Coverage is open on ${input.dayLabel}`
  const lead = `${actor} removed themselves from the slot, and it is now open.`
  const window = formatWindow(input.startsAt, input.endsAt)

  const lines = [lead, '', 'Open slot:', `  • ${window}`]
  if (input.scheduleUrl) {
    lines.push('', `Pick it up: ${input.scheduleUrl}`)
  } else {
    lines.push('', 'Open the Schedule tab in the app to pick it up.')
  }

  const text = lines.join('\n')

  const linkHtml = input.scheduleUrl
    ? `<p><a href="${escapeHtml(input.scheduleUrl)}">Pick up this slot</a></p>`
    : `<p>Open the Schedule tab in the app to pick it up.</p>`

  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    `<p><strong>Open slot:</strong></p>`,
    `<ul><li>${escapeHtml(window)}</li></ul>`,
    linkHtml,
  ].join('\n')

  return { subject, text, html }
}
