import { useState } from 'react'
import { api, setToken } from '../api'

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isLogin = mode === 'login'
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = isLogin
        ? { email: form.email, password: form.password }
        : form
      const data = await api(`/auth/${mode}`, { method: 'POST', body })
      setToken(data.accessToken)
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo">💬</div>
        <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {isLogin ? 'Sign in to join the conversation.' : 'Join rooms and chat in real time.'}
        </p>

        <form onSubmit={submit}>
          {!isLogin && (
            <label>
              Username
              <input value={form.username} onChange={update('username')} placeholder="cool_name" required autoComplete="username" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder={isLogin ? 'Your password' : 'At least 8 characters, letters + numbers'}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p className="switch">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            className="link"
            onClick={() => { setMode(isLogin ? 'register' : 'login'); setError('') }}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
