import { StartAuthJS } from 'start-authjs'
import { authConfig } from '#/utils/auth'

export const { GET, POST } = StartAuthJS(authConfig)
