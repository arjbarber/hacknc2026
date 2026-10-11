const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

async function request(path, options = {}) {
  let response
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('aerorithmetic-access-token') : null
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders,
        ...options.headers,
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error(`Could not reach the API at ${API_BASE}. Check that the backend is running.`, { cause: error })
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || data?.detail || data?.error || `Request failed (${response.status}).`)
  }
  return data
}

export const api = {
  // Market & Trading
  health: () => request('/'),
  price: (symbol) => request(`/prices/${encodeURIComponent(symbol)}`),
  candles: (symbol, interval = '1m', limit = 120) => request(`/prices/${encodeURIComponent(symbol)}/candles?${new URLSearchParams({ interval, limit })}`),
  order: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  portfolio: (userId) => request(`/portfolio/${encodeURIComponent(userId)}`),
  orders: (userId, limit = 50) => request(`/orders/${encodeURIComponent(userId)}?${new URLSearchParams({ limit })}`),
  leaderboard: (limit = 20) => request(`/leaderboard?${new URLSearchParams({ limit })}`),

  // Machine Learning
  train: (payload) => request('/models/train', { method: 'POST', body: JSON.stringify(payload) }),
  predict: (modelId) => request(`/models/${encodeURIComponent(modelId)}/predict`),
  overlay: (modelId) => request(`/models/${encodeURIComponent(modelId)}/overlay`),
  savedModels: (userId) => request(`/users/${encodeURIComponent(userId)}/models`),
  saveModel: (modelId, payload) => request(`/models/${encodeURIComponent(modelId)}/save`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteModel: (modelId, userId) => request(`/models/${encodeURIComponent(modelId)}?${new URLSearchParams({ user_id: userId })}`, { method: 'DELETE' }),
  history: (symbol, limit = 5000) => request(`/history/${encodeURIComponent(symbol)}?${new URLSearchParams({ limit })}`),
  news: (symbol, limit = 20) => request(`/news?${new URLSearchParams({ symbol, limit })}`),
  fihMessage: (payload, signal) => request('/fih/message', { method: 'POST', body: JSON.stringify(payload), signal }),

  // Authentication & Tiger Data Profile
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (email, password, name) => request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (name) => request('/auth/profile', { method: 'PUT', body: JSON.stringify({ name }) }),
  googleUrl: (redirectTo) => request(`/auth/google/url?${new URLSearchParams({ redirect_to: redirectTo })}`),
  googleIdToken: (idToken, nonce) => request('/auth/google', { method: 'POST', body: JSON.stringify({ id_token: idToken, nonce }) }),
  exchangeCode: (authCode, codeVerifier) => request('/auth/exchange-code', {
    method: 'POST',
    body: JSON.stringify({ auth_code: authCode, code_verifier: codeVerifier || undefined }),
  }),
  resetPassword: (email, redirectTo) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, redirect_to: redirectTo }) }),
}
