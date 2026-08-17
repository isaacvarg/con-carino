export const AUTH_BASE_PATH = '/api/auth'

/**
 * start-authjs derives Auth.js basePath from AUTH_URL's pathname and deletes
 * the explicit `/api/auth` config when AUTH_URL is set. An origin-only value
 * (`http://localhost:3000`) makes basePath `/`, and every auth action then
 * fails with UnknownAction. Append the auth path when the URL has none.
 */
export function normalizeAuthUrl(
  authUrl: string | undefined | null,
): string | undefined {
  const trimmed = authUrl?.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = AUTH_BASE_PATH
    }
    return url.href.replace(/\/$/, '')
  } catch {
    return trimmed
  }
}

export function ensureAuthUrlHasBasePath(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const normalized = normalizeAuthUrl(env.AUTH_URL)
  if (normalized) env.AUTH_URL = normalized
}
