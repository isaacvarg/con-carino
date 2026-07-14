import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import type { AuthSession } from 'start-authjs'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  session: AuthSession | null
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: {
      session: null,
    } satisfies RouterContext,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
