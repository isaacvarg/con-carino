import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { GET } = await import('#/server/auth-handlers')
        return GET({ request, response: new Response() })
      },
      POST: async ({ request }) => {
        const { POST } = await import('#/server/auth-handlers')
        return POST({ request, response: new Response() })
      },
    },
  },
})
