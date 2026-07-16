import { verifyFileToken } from '#/lib/file-tokens'
import { getBucketName, getObject } from '#/lib/storage'


function errorName(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : ''
}

function httpStatus(error: unknown): number | undefined {
  const status = (error as { $metadata?: { httpStatusCode?: unknown } })
    ?.$metadata?.httpStatusCode
  return typeof status === 'number' ? status : undefined
}

function sanitizeFilename(key: string): string {
  const base = key.split('/').pop() ?? 'file'
  return base.replace(/[^\w.\- ]+/g, '_')
}

export async function handleFileGet(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const bucket = params.get('b')
  const key = params.get('k')
  const exp = Number(params.get('e'))
  const sig = params.get('s')

  if (!bucket || !key || !sig || !Number.isFinite(exp)) {
    return new Response('Bad request', { status: 400 })
  }
  if (bucket !== getBucketName()) {
    return new Response('Not found', { status: 404 })
  }

  const verdict = verifyFileToken(bucket, key, exp, sig)
  if (verdict === 'invalid') {
    return new Response('Forbidden', { status: 403 })
  }
  if (verdict === 'expired') {
    return new Response('Link expired', { status: 403 })
  }

  const range = request.headers.get('range') ?? undefined

  try {
    const object = await getObject(key, range)
    if (!object.Body) {
      return new Response('Not found', { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', object.ContentType ?? 'application/octet-stream')
    headers.set(
      'Content-Disposition',
      `inline; filename="${sanitizeFilename(key)}"`,
    )
    headers.set('Accept-Ranges', 'bytes')
    // Per-user, time-limited links: let the browser cache within the link's
    // lifetime but keep shared caches out.
    headers.set('Cache-Control', 'private, max-age=3600')
    if (object.ContentLength != null) {
      headers.set('Content-Length', String(object.ContentLength))
    }
    if (object.ETag) headers.set('ETag', object.ETag)
    if (object.ContentRange) headers.set('Content-Range', object.ContentRange)

    const status = object.ContentRange ? 206 : 200
    return new Response(object.Body.transformToWebStream(), {
      status,
      headers,
    })
  } catch (error) {
    const status = httpStatus(error)
    const name = errorName(error)
    if (status === 404 || name === 'NoSuchKey' || name === 'NotFound') {
      return new Response('Not found', { status: 404 })
    }
    if (status === 416 || name === 'InvalidRange') {
      return new Response('Range not satisfiable', { status: 416 })
    }
    console.error('File proxy failed:', error)
    return new Response('Internal error', { status: 500 })
  }
}
