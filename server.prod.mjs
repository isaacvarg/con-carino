import { serve } from 'srvx'
import { serveStatic } from 'srvx/static'
import handler from './dist/server/server.js'

serve({
  fetch: handler.fetch,
  port: Number(process.env.PORT ?? 3000),
  middleware: [serveStatic({ dir: './dist/client' })],
})
