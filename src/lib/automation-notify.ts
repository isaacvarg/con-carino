import { escapeHtml } from '#/lib/email-format'

export type LowBalanceEmailInput = {
  automationName: string
  accountName: string
  /** Current balance and the configured floor, as display numbers. */
  balance: number
  threshold: number
  accountUrl: string | null
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Deep link to an account. The route fills its own search defaults. */
export function buildAccountUrl(origin: string, accountId: string): string {
  return `${origin.replace(/\/$/, '')}/accounts/${accountId}`
}

/** Told-you-so email for an account that dropped below its floor. */
export function buildLowBalanceEmail(input: LowBalanceEmailInput): {
  subject: string
  text: string
  html: string
} {
  const balance = money(input.balance)
  const threshold = money(input.threshold)
  const subject = `${input.accountName} is below ${threshold}`
  const lead = `${input.accountName} is at ${balance}, below the ${threshold} floor set by “${input.automationName}”.`

  const lines = [lead]
  if (input.accountUrl) {
    lines.push('', `Open the account: ${input.accountUrl}`)
  } else {
    lines.push('', 'Open the account in the app to top it up.')
  }
  const text = lines.join('\n')

  const linkHtml = input.accountUrl
    ? `<p><a href="${escapeHtml(input.accountUrl)}">Open ${escapeHtml(input.accountName)}</a></p>`
    : `<p>Open the account in the app to top it up.</p>`

  const html = [`<p>${escapeHtml(lead)}</p>`, linkHtml].join('\n')

  return { subject, text, html }
}
