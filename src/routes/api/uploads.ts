import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleUpload } = await import('#/server/uploads')
        return handleUpload(request)
      },
    },
  },
})
