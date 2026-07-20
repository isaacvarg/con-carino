const BASE_PATH = '/api/auth'

async function getCsrfToken(): Promise<string> {
  const res = await fetch(`${BASE_PATH}/csrf`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
  const data = (await res.json()) as { csrfToken: string }
  return data.csrfToken
}

function submitForm(action: string, fields: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export async function signIn(
  provider: 'google' | 'discord',
  callbackUrl: string = '/',
) {
  const csrfToken = await getCsrfToken()
  submitForm(`${BASE_PATH}/signin/${provider}`, { csrfToken, callbackUrl })
}

// The email provider needs an extra `email` field alongside the CSRF token.
// The form POST navigates the browser, so Auth.js lands the user on the
// verifyRequest page itself — no client-side redirect needed here.
export async function signInWithEmail(
  email: string,
  callbackUrl: string = '/',
) {
  const csrfToken = await getCsrfToken()
  submitForm(`${BASE_PATH}/signin/resend`, { csrfToken, callbackUrl, email })
}

export async function signOut(callbackUrl: string = '/') {
  const csrfToken = await getCsrfToken()
  submitForm(`${BASE_PATH}/signout`, { csrfToken, callbackUrl })
}
