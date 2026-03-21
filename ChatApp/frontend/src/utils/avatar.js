import { resolveMediaUrl } from './media'

export const getAvatarUrl = (user) => {
  if (!user) return getDefaultAvatar('U')
  
  // Try avatar_url first
  if (user.avatar_url) {
    const resolved = resolveMediaUrl(user.avatar_url)
    if (resolved) return resolved
  }
  
  // Try avatar field
  if (user.avatar) {
    const resolved = resolveMediaUrl(user.avatar)
    if (resolved) return resolved
  }
  
  // Fallback: generate SVG with initials
  return getDefaultAvatar(user.name || 'U')
}

export const getDefaultAvatar = (name) => {
  const initials = (name || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%234f46e5' width='100' height='100'/%3E%3Ctext x='50' y='50' font-size='40' fill='white' text-anchor='middle' dy='.3em' font-family='Arial'%3E${initials}%3C/text%3E%3C/svg%3E`
}
