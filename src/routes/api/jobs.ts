import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/jobs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleJobStatus } = await import('#/server/jobs/http')
        return handleJobStatus(request)
      },
      POST: async ({ request }) => {
        const { handleJobRun } = await import('#/server/jobs/http')
        return handleJobRun(request)
      },
    },
  },
})
