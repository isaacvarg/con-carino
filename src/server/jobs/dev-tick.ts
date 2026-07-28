/**
 * In-process job ticker for development.
 *
 * Production drives jobs from the `cron` service in docker-compose.prod.yml,
 * which POSTs /api/jobs on a loop. This exists so the same job path is
 * exercised locally without running that container.
 *
 * Known limitation: Vite dev has no server-boot hook without a custom plugin,
 * so this starts on the first SSR request that calls it rather than at process
 * start. That is still a real improvement over the lazy page-load maintenance
 * it replaces — after one page load, jobs keep running with no further
 * requests.
 *
 * Guarded on globalThis so Vite HMR cannot stack intervals, mirroring the
 * Prisma client singleton in src/lib/prisma.ts.
 */

const globalForJobTick = globalThis as unknown as {
  jobTick?: ReturnType<typeof setInterval>
}

const TICK_MS = 60_000

export function startDevJobTick(): void {
  if (process.env.NODE_ENV === 'production') return
  if (globalForJobTick.jobTick) return

  const tick = () => {
    void (async () => {
      try {
        const { runDueJobs } = await import('#/server/jobs/runner')
        await runDueJobs(new Date())
      } catch (err) {
        console.error('[jobs] dev tick failed', err)
      }
    })()
  }

  const timer = setInterval(tick, TICK_MS)
  // Do not hold the process open on this alone.
  timer.unref?.()
  globalForJobTick.jobTick = timer

  tick()
}
