// Tiny API client. Keeps the access token in memory (NOT localStorage, so XSS can't read it from
// storage) and silently refreshes it using the httpOnly cookie when it expires.

let accessToken = null
let refreshing = null // shared promise so parallel 401s trigger only one refresh

export const getToken = () => accessToken
export const setToken = (t) => { accessToken = t }

async function send(path, { method = 'GET', body } = {}) {
  return fetch(`/api${path}`, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    body: body && JSON.stringify(body),
    credentials: 'same-origin',
  })
}

// Asks the server for a new access token. Returns the session, or null if logged out.
export function refreshSession() {
  refreshing ??= send('/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) { accessToken = null; return null }
      const data = await res.json()
      accessToken = data.accessToken
      return data
    })
    .finally(() => { refreshing = null })
  return refreshing
}

export async function api(path, options) {
  let res = await send(path, options)

  // Access token expired? Refresh once and retry.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(path, options)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}
