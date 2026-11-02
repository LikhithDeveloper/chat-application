import { io } from 'socket.io-client'
import { getToken } from './api'

// `auth` as a function is re-run on every (re)connect, so we always send the freshest token.
export function connectSocket() {
  return io({ auth: (cb) => cb({ token: getToken() }) })
}
