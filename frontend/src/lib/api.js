const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE}. Check that the backend is running.`)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || data?.detail || data?.error || `Request failed (${response.status}).`)
  }
  return data
}

export const api = {
  price: (symbol) => request(`/prices/${encodeURIComponent(symbol)}`),
  candles: (symbol, interval = '1m', limit = 120) => request(`/prices/${encodeURIComponent(symbol)}/candles?${new URLSearchParams({ interval, limit })}`),
  order: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  portfolio: (userId) => request(`/portfolio/${encodeURIComponent(userId)}`),
  leaderboard: (limit = 20) => request(`/leaderboard?${new URLSearchParams({ limit })}`),
  train: (payload) => request('/models/train', { method: 'POST', body: JSON.stringify(payload) }),
  predict: (modelId) => request(`/models/${encodeURIComponent(modelId)}/predict`),
  news: (symbol, limit = 20) => request(`/news?${new URLSearchParams({ symbol, limit })}`),
}