import { StartAuthJS } from 'start-authjs'
import { ensureAuthUrlHasBasePath } from '#/lib/auth-url'
import { authConfig } from '#/utils/auth'

export const { GET, POST } = StartAuthJS(() => {
  ensureAuthUrlHasBasePath()
  return Promise.resolve(authConfig)
})
