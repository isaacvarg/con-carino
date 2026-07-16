import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildSignedFileUrl,
  signFileToken,
  verifyFileToken,
} from './file-tokens'

const ORIGINAL_SECRET = process.env.AUTH_SECRET

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret'
})

afterAll(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET
})

describe('file tokens', () => {
  const bucket = 'con-carino'
  const key = 'user-1/2026/file.pdf'

  it('verifies a freshly signed token', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = signFileToken(bucket, key, exp)
    expect(verifyFileToken(bucket, key, exp, sig)).toBe('ok')
  })

  it('rejects a tampered key', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = signFileToken(bucket, key, exp)
    expect(verifyFileToken(bucket, 'user-2/2026/file.pdf', exp, sig)).toBe(
      'invalid',
    )
  })

  it('rejects a tampered expiry', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    const sig = signFileToken(bucket, key, exp)
    expect(verifyFileToken(bucket, key, exp + 1, sig)).toBe('invalid')
  })

  it('rejects malformed signatures', () => {
    const exp = Math.floor(Date.now() / 1000) + 60
    expect(verifyFileToken(bucket, key, exp, 'zz-not-hex')).toBe('invalid')
    expect(verifyFileToken(bucket, key, exp, 'abcd')).toBe('invalid')
    expect(verifyFileToken(bucket, key, Number.NaN, 'abcd')).toBe('invalid')
  })

  it('reports expired tokens whose signature is valid', () => {
    const exp = Math.floor(Date.now() / 1000) - 10
    const sig = signFileToken(bucket, key, exp)
    expect(verifyFileToken(bucket, key, exp, sig)).toBe('expired')
  })

  it('builds a same-origin URL that round-trips verification', () => {
    const url = buildSignedFileUrl(bucket, key)
    const params = new URL(url, 'http://localhost').searchParams
    expect(url.startsWith('/api/files?')).toBe(true)
    expect(params.get('b')).toBe(bucket)
    expect(params.get('k')).toBe(key)
    expect(
      verifyFileToken(
        params.get('b')!,
        params.get('k')!,
        Number(params.get('e')),
        params.get('s')!,
      ),
    ).toBe('ok')
  })
})
