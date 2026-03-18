export const resolveMediaUrl = (value) => {
  if (!value) return ''

  const raw = String(value).trim()
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/api/')) return raw
  if (raw.startsWith('/storage/')) return raw
  if (raw.startsWith('storage/')) return `/${raw}`
  if (raw.startsWith('/')) return raw

  return `/storage/${raw}`
}
