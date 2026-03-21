import { resolveMediaUrl } from './media'

export const getAvatarUrl = (user) => {
  if (!user) return getDefaultAvatar('U')
  
  // Try avatar_url first
  if (user.avatar_url) {
    const resolved = resolveMediaUrl(user.avatar_url)
    if (resolved && resolved.trim()) return resolved
  }
  
  // Try avatar field
  if (user.avatar) {
    const resolved = resolveMediaUrl(user.avatar)
    if (resolved && resolved.trim()) return resolved
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
  
  // Use logo blue color for default avatars
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#5DADE2" width="100" height="100"/><text x="50" y="55" font-size="40" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">${initials}</text></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}
