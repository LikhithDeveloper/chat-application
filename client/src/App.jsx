import { useEffect, useState } from 'react'
import { api, refreshSession, setToken } from './api'
import AuthPage from './components/AuthPage'
import ChatApp from './components/ChatApp'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On page load, try to restore the session from the refresh cookie.
  useEffect(() => {
    refreshSession().then((session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
  }, [])

  // Keep the 15-minute access token fresh while the app is open.
  useEffect(() => {
    if (!user) return
    const timer = setInterval(async () => {
      if (!(await refreshSession())) setUser(null) // session ended
    }, 10 * 60 * 1000)
    return () => clearInterval(timer)
  }, [user])

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    setUser(null)
  }

  if (loading) return <div className="splash"><div className="spinner" /></div>
  if (!user) return <AuthPage onLogin={setUser} />
  return <ChatApp user={user} onLogout={logout} />
}
