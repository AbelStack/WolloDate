import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import { Clock, User, LogOut, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export default function PendingVerification() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState(null)

  // Auto-check every 30 seconds
  useEffect(() => {
    const checkApproval = async () => {
      try {
        await refreshUser()
      } catch (err) {
        console.error('Failed to check approval status', err)
      }
    }

    // Initial check
    checkApproval()

    // Set up interval
    const interval = setInterval(checkApproval, 30000)
    return () => clearInterval(interval)
  }, [])

  // Redirect if approved
  useEffect(() => {
    if (user?.is_approved) {
      navigate('/', { replace: true })
    }
  }, [user?.is_approved, navigate])

  const handleCheckNow = async () => {
    setChecking(true)
    try {
      await refreshUser()
      setLastChecked(new Date())
    } catch (err) {
      console.error('Failed to check', err)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-4">
            <Link to="/profile" className="text-gray-400 hover:text-white">
              <User size={22} />
            </Link>
            <button onClick={logout} className="text-gray-400 hover:text-white">
              <LogOut size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          {/* Pending Icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Clock size={40} className="text-yellow-500" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white mb-2">
            Verification Pending
          </h1>

          {/* Message */}
          <p className="text-gray-400 mb-6">
            Hi <span className="text-white font-medium">{user?.name}</span>, your student ID is being reviewed by our admin team. Once verified, you'll get full access to WolloDate.
          </p>

          {/* Status Card */}
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Status</span>
              <span className="flex items-center gap-2 text-yellow-500">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                Under Review
              </span>
            </div>
          </div>

          {/* Check Now Button */}
          <button
            onClick={handleCheckNow}
            disabled={checking}
            className="w-full mb-6 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm text-gray-300 flex items-center justify-center gap-2 transition"
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check Status'}
            {lastChecked && !checking && (
              <span className="text-xs text-gray-500 ml-2">
                (last: {lastChecked.toLocaleTimeString()})
              </span>
            )}
          </button>

          {/* What you can do */}
          <div className="text-left mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">While you wait, you can:</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                View and edit your profile
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full"></span>
                <span className="line-through">Browse posts and feed</span>
                <span className="text-xs text-gray-600">(locked)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full"></span>
                <span className="line-through">Send messages</span>
                <span className="text-xs text-gray-600">(locked)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-600 rounded-full"></span>
                <span className="line-through">Follow other users</span>
                <span className="text-xs text-gray-600">(locked)</span>
              </li>
            </ul>
          </div>

          {/* Profile Button */}
          <Link 
            to="/profile" 
            className="btn-primary inline-flex items-center gap-2 px-6"
          >
            <User size={18} />
            View My Profile
          </Link>

          {/* Note */}
          <p className="text-xs text-gray-500 mt-6">
            This page auto-checks every 30 seconds. You'll be redirected automatically once approved.
          </p>
        </div>
      </main>
    </div>
  )
}
