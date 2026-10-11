import { useState } from 'react'
import { api } from '../lib/api.js'
import './AuthModal.css'

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (!isOpen) return null

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError('')
    try {
      const redirectUri = window.location.origin
      const res = await api.googleUrl(redirectUri)
      if (res?.url) {
        window.location.href = res.url
      } else {
        throw new Error('No Google authentication URL returned.')
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate Google sign-in.')
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in both email and password.')
      return
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      if (mode === 'login') {
        const res = await api.login(email, password)
        if (res.session?.access_token) {
          localStorage.setItem('aerorithmetic-access-token', res.session.access_token)
          if (res.session.refresh_token) {
            localStorage.setItem('aerorithmetic-refresh-token', res.session.refresh_token)
          }
        }
        if (res.user?.id) {
          localStorage.setItem('aerorithmetic-user-id', res.user.id)
        }
        onAuthSuccess(res.user)
        onClose()
      } else {
        const res = await api.signup(email, password, name.trim() || undefined)
        if (res.session?.access_token) {
          localStorage.setItem('aerorithmetic-access-token', res.session.access_token)
          if (res.session.refresh_token) {
            localStorage.setItem('aerorithmetic-refresh-token', res.session.refresh_token)
          }
          if (res.user?.id) {
            localStorage.setItem('aerorithmetic-user-id', res.user.id)
          }
          onAuthSuccess(res.user)
          onClose()
        } else {
          setSuccessMsg(res.message || 'Account created! Please check your email to verify.')
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal-window" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" type="button" onClick={onClose} aria-label="Close modal">
          ✕
        </button>

        <div className="auth-modal-header">
          <div className="auth-brand-badge">
            <span className="badge-dot" />
            <span>Tiger Data · TimescaleDB Auth</span>
          </div>
          <h2>{mode === 'login' ? 'Welcome Back' : 'Create Trader Account'}</h2>
          <p>
            {mode === 'login'
              ? 'Log in to sync your portfolio and saved models across sessions.'
              : 'Sign up to start paper trading with $100,000 starting cash.'}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); setSuccessMsg('') }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); setSuccessMsg('') }}
          >
            Create Account
          </button>
        </div>

        <button
          type="button"
          className="google-auth-btn"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          <svg className="google-icon" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.36 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.6H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.4l4.03-3.13z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.6l4.03 3.13c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>{googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}</span>
        </button>

        <div className="auth-divider">
          <span>or with email</span>
        </div>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {successMsg && <div className="auth-alert auth-alert-success">{successMsg}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-name">
                <span>Display Name</span>
                <small style={{ color: '#829aa8', fontWeight: 400 }}>optional</small>
              </label>
              <input
                id="auth-name"
                type="text"
                placeholder="e.g. Satoshi Trader"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading ? 'Processing…' : mode === 'login' ? 'Sign In to Aerorithmetic' : 'Create Account'}
          </button>
        </form>

        <div className="auth-tiger-note">
          <span>🔒</span>
          <span>
            Linked to TimescaleDB <strong>users</strong> table · Starting capital $100,000
          </span>
        </div>
      </div>
    </div>
  )
}

export function AccountModal({ isOpen, user, accountStats, onClose, onLogout, onProfileUpdated }) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  if (!isOpen || !user) return null

  async function handleSaveProfile(e) {
    e.preventDefault()
    if (!nameValue.trim()) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await api.updateProfile(nameValue.trim())
      setSaveMsg('Display name saved in Tiger Data!')
      setEditingName(false)
      if (onProfileUpdated) onProfileUpdated(res.user)
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const money = (val) =>
    Number.isFinite(Number(val))
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
      : '—'

  return (
    <div className="auth-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal-window account-panel-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" type="button" onClick={onClose} aria-label="Close modal">
          ✕
        </button>

        <div className="auth-modal-header" style={{ marginBottom: 12 }}>
          <div className="auth-brand-badge">
            <span className="badge-dot" />
            <span>Tiger Data Connected</span>
          </div>
          <h2>{user.name || user.email?.split('@')[0] || 'Trader Account'}</h2>
          <p>{user.email || 'Authenticated User'}</p>
        </div>

        <div className="account-summary-card">
          <div className="account-stat">
            <span>Tiger Data ID</span>
            <strong style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {user.id}
            </strong>
          </div>
          <div className="account-stat">
            <span>Cash Available</span>
            <strong style={{ color: '#19876a' }}>
              {accountStats?.cash ? money(accountStats.cash) : '$100,000.00'}
            </strong>
          </div>
          <div className="account-stat">
            <span>Open Positions</span>
            <strong>{accountStats?.position_count ?? '—'}</strong>
          </div>
          <div className="account-stat">
            <span>Orders Placed</span>
            <strong>{accountStats?.order_count ?? '—'}</strong>
          </div>
        </div>

        {saveMsg && (
          <div
            className={`auth-alert ${saveMsg.startsWith('Error') ? 'auth-alert-error' : 'auth-alert-success'}`}
          >
            {saveMsg}
          </div>
        )}

        {editingName ? (
          <form className="auth-form" onSubmit={handleSaveProfile} style={{ marginTop: 12 }}>
            <div className="auth-field">
              <label htmlFor="edit-name">Display Name (in Tiger Data users table)</label>
              <input
                id="edit-name"
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="auth-submit-btn" type="submit" style={{ flex: 1 }} disabled={saving}>
                {saving ? 'Saving…' : 'Save Name'}
              </button>
              <button
                type="button"
                className="auth-tab"
                style={{ padding: '8px 16px', background: '#eef6f9' }}
                onClick={() => setEditingName(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="text-action"
            style={{ width: '100%', textAlign: 'center', margin: '8px 0', fontSize: 12 }}
            onClick={() => {
              setNameValue(user.name || '')
              setEditingName(true)
            }}
          >
            ✏️ Change Display Name in Tiger Data
          </button>
        )}

        <button type="button" className="account-signout-btn" onClick={onLogout}>
          Sign Out of Account
        </button>
      </div>
    </div>
  )
}
