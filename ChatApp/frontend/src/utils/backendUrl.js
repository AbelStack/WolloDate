const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '')

const normalizeApiBaseUrl = (value) => {
  const normalized = trimTrailingSlash(value)

  if (!normalized) return '/api'
  if (normalized.endsWith('/api')) return normalized

  return `${normalized}/api`
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)

export const BACKEND_BASE_URL = API_BASE_URL === '/api'
  ? ''
  : API_BASE_URL.replace(/\/api$/, '')

export const buildApiUrl = (path) => {
  const normalizedPath = String(path || '').startsWith('/')
    ? String(path || '')
    : `/${String(path || '')}`

  return `${API_BASE_URL}${normalizedPath}`
}

export const buildBackendUrl = (path) => {
  const normalizedPath = String(path || '').startsWith('/')
    ? String(path || '')
    : `/${String(path || '')}`

  return BACKEND_BASE_URL ? `${BACKEND_BASE_URL}${normalizedPath}` : normalizedPath
}
