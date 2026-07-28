import { timingSafeEqual } from 'node:crypto'
import { getSession } from 'start-authjs'
import {
  listJobSummaries,
  runDueJobs,
  runJobByName,
} from '#/server/jobs/runner'
import { authConfig } from '#/utils/auth'

type SecretVerdict = 'ok' | 'unauthorized' | 'not-configured'

/**
 * Bearer-token check against JOB_SECRET.
 *
 * Deliberately its own secret rather than an AUTH_SECRET-derived HMAC:
 * AUTH_SECRET already signs Auth.js sessions and file links, and a third
 * consumer would mean rotating it breaks cron, every session, and every
 * outstanding file link at once. The caller here is a fixed peer on the
 * internal Docker network, so a bearer token is the right weight.
 *
 * Read from process.env inside the handler, never at module scope (AGENTS.md).
 */
function checkSecret(request: Request): SecretVerdict {
  const secret = process.env.JOB_SECRET?.trim()
  if (!secret) {
    // Fail closed in production; in dev an unset secret leaves the endpoint
    // open on localhost so you can poke it without ceremony.
    return process.env.NODE_ENV === 'production' ? 'not-configured' : 'ok'
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : ''

  const expectedBuf = Buffer.from(secret, 'utf8')
  const providedBuf = Buffer.from(provided, 'utf8')
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return 'unauthorized'
  }
  return 'ok'
}

/** POST /api/jobs — run due jobs, or one named job. Secret-authed. */
export async function handleJobRun(request: Request): Promise<Response> {
  const verdict = checkSecret(request)
  if (verdict === 'not-configured') {
    return new Response('JOB_SECRET is not configured.', { status: 500 })
  }
  if (verdict === 'unauthorized') {
    return new Response(null, { status: 401 })
  }

  let jobName: string | null = null
  try {
    const raw = await request.text()
    if (raw.trim()) {
      const body: unknown = JSON.parse(raw)
      if (body && typeof body === 'object' && 'job' in body) {
        const value = (body as { job?: unknown }).job
        if (typeof value === 'string' && value.trim()) {
          jobName = value.trim()
        }
      }
    }
  } catch {
    return new Response('Invalid JSON body.', { status: 400 })
  }

  const now = new Date()
  const outcomes = jobName
    ? [await runJobByName(jobName, now)]
    : await runDueJobs(now)

  const failed = outcomes.filter((o) => o.status === 'failed')
  // Non-200 on failure so the cron container's `curl -f` logs it rather than
  // silently swallowing a broken job.
  return Response.json(
    { ranAt: now.toISOString(), outcomes },
    { status: failed.length > 0 ? 500 : 200 },
  )
}

/** GET /api/jobs — last-run summaries. Session-authed, not secret-authed. */
export async function handleJobStatus(request: Request): Promise<Response> {
  const session = await getSession(request, authConfig)
  if (!session?.user?.id) {
    return new Response(null, { status: 401 })
  }
  return Response.json({ jobs: await listJobSummaries() })
}
