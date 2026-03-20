import { buildBackendUrl } from './backendUrl'

export const resolveMediaUrl = (value) => {
  if (!value) return ''

  const raw = String(value).trim()
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/api/')) return buildBackendUrl(raw)
  if (raw.startsWith('/storage/')) return buildBackendUrl(raw)
  if (raw.startsWith('storage/')) return buildBackendUrl(`/${raw}`)
  if (raw.startsWith('/')) return raw

  return buildBackendUrl(`/storage/${raw}`)
}
