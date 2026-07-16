import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/files')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleFileGet } = await import('#/server/files')
        return handleFileGet(request)
      },
    },
  },
})
