import '@tanstack/react-start/server-only'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: 'missing_config' | 'resend_error' }

/**
 * Send via Resend using the same AUTH_RESEND_KEY / AUTH_EMAIL_FROM as magic links.
 * No-ops (with a warn) when the key is unset so local/dev without Resend still works.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.AUTH_RESEND_KEY?.trim()
  const from = process.env.AUTH_EMAIL_FROM?.trim()
  if (!apiKey || !from) {
    console.warn(
      '[email] Skipping send — AUTH_RESEND_KEY or AUTH_EMAIL_FROM is not configured.',
    )
    return { sent: false, reason: 'missing_config' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(
      `[email] Resend error ${res.status}: ${body || res.statusText}`,
    )
    return { sent: false, reason: 'resend_error' }
  }

  const data = (await res.json().catch(() => null)) as { id?: string } | null
  return { sent: true, id: data?.id ?? null }
}
