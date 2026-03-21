import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/useSocket'
import { Home, Search, MessageCircle, User, Shield, Bell } from 'lucide-react'

export default function BottomNav() {
  const { user } = useAuth()
  const { unreadChatCount, alertCount } = useSocket()
  const location = useLocation()
  
  // Don't show nav on auth pages or pending verification
  if (['/login', '/signup', '/pending'].includes(location.pathname)) {
    return null
  }

  const navItems = [
    { to: '/', icon: Home, label: 'Feed' },
    { to: '/notifications', icon: Bell, label: 'Alerts', badge: alertCount },
    { to: '/search', icon: Search, label: 'Search' },
    { to: '/chat', icon: MessageCircle, label: 'Chat', badge: unreadChatCount },
    { to: '/profile', icon: User, label: 'Profile' },
  ]

  // Add admin link if user is admin
  if (user?.role === 'admin') {
    navItems.splice(4, 0, { to: '/admin', icon: Shield, label: 'Admin' })
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-50 safe-area-bottom h-16">
      <div className="max-w-xl mx-auto flex items-center justify-around h-full">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `
              flex flex-col items-center justify-center py-2 px-4 min-w-15 relative
              transition-colors duration-200
              ${isActive 
                ? 'text-white' 
                : 'text-gray-500 hover:text-gray-300'
              }
            `}
          >
            <div className="relative">
              <Icon size={24} strokeWidth={1.5} />
              {Number(badge) > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {Number(badge) > 9 ? '9+' : Number(badge)}
                </span>
              )}
            </div>
            <span className="text-xs mt-1 font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
