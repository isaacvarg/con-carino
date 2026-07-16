import { createHmac, timingSafeEqual } from 'node:crypto'

// Files are served to the browser through the same-origin proxy route at
// /api/files rather than via S3 presigned URLs, because the object store is
// not reachable from a browser behind the Cloudflare tunnel in production.
// Each link carries an HMAC over the bucket, key, and expiry so it cannot be
// tampered with or forged without AUTH_SECRET.

export const FILE_URL_TTL_SECONDS = 60 * 60

function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured.')
  }
  return secret
}

export function signFileToken(
  bucket: string,
  key: string,
  exp: number,
): string {
  return createHmac('sha256', getSecret())
    .update(`${bucket}\n${key}\n${exp}`)
    .digest('hex')
}

export type FileTokenVerdict = 'ok' | 'expired' | 'invalid'

export function verifyFileToken(
  bucket: string,
  key: string,
  exp: number,
  sig: string,
): FileTokenVerdict {
  if (!Number.isFinite(exp)) {
    return 'invalid'
  }

  const expected = Buffer.from(signFileToken(bucket, key, exp), 'hex')
  let provided: Buffer
  try {
    provided = Buffer.from(sig, 'hex')
  } catch {
    return 'invalid'
  }
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return 'invalid'
  }

  if (exp < Math.floor(Date.now() / 1000)) {
    return 'expired'
  }
  return 'ok'
}

export function buildSignedFileUrl(
  bucket: string,
  key: string,
  ttlSeconds = FILE_URL_TTL_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const params = new URLSearchParams({
    b: bucket,
    k: key,
    e: String(exp),
    s: signFileToken(bucket, key, exp),
  })
  return `/api/files?${params.toString()}`
}
