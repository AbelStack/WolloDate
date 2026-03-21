import { Check } from 'lucide-react'

/**
 * VerifiedBadge - Blue checkmark badge for verified users (Instagram/Twitter style)
 * 
 * Usage:
 *   <VerifiedBadge />
 *   <VerifiedBadge size="sm" />
 *   
 *   // Only show if user is verified:
 *   {user.is_approved && <VerifiedBadge />}
 */
export default function VerifiedBadge({ size = 'md', className = '' }) {
  const sizeMap = {
    xs: { container: 12, icon: 8 },
    sm: { container: 14, icon: 9 },
    md: { container: 15, icon: 10 },
    lg: { container: 18, icon: 12 },
    xl: { container: 22, icon: 14 },
  }

  const { container, icon } = sizeMap[size]

  return (
    <span 
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className}`}
      style={{ 
        width: container, 
        height: container,
        backgroundColor: '#5DADE2' // Logo blue
      }}
      aria-label="Verified account"
    >
      <Check 
        size={icon} 
        className="text-white"
        strokeWidth={3}
      />
    </span>
  )
}
