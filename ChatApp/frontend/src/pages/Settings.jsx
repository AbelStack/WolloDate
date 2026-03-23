import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, BellOff, Loader2 } from 'lucide-react'
import { 
  subscribeToPushNotifications, 
  unsubscribeFromPushNotifications,
  getNotificationPermission,
  isNotificationSupported 
} from '../utils/notifications'

export default function Settings() {
  const navigate = useNavigate()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState('default')

  useEffect(() => {
    checkNotificationStatus()
  }, [])

  const checkNotificationStatus = () => {
    const status = getNotificationPermission()
    setPermissionStatus(status)
    setNotificationsEnabled(status === 'granted')
  }

  const handleToggleNotifications = async () => {
    if (loading) return

    setLoading(true)
    try {
      if (notificationsEnabled) {
        // Unsubscribe
        await unsubscribeFromPushNotifications()
        setNotificationsEnabled(false)
        alert('Notifications disabled')
      } else {
        // Subscribe
        await subscribeToPushNotifications()
        setNotificationsEnabled(true)
        checkNotificationStatus()
        alert('Notifications enabled! You will now receive push notifications.')
      }
    } catch (error) {
      console.error('Error toggling notifications:', error)
      
      if (error.message?.includes('denied')) {
        alert('Notification permission denied. Please enable notifications in your browser settings.')
      } else if (error.message?.includes('not supported')) {
        alert('Push notifications are not supported in this browser.')
      } else {
        alert('Failed to toggle notifications. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-800 rounded-full transition"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Notifications Section */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold">Notifications</h2>
          </div>

          {!isNotificationSupported() ? (
            <div className="px-4 py-6 text-center text-gray-500">
              <BellOff size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Push notifications are not supported in this browser</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell size={18} />
                    <span className="font-medium">Push Notifications</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    {permissionStatus === 'denied' 
                      ? 'Blocked - Enable in browser settings'
                      : 'Get notified about messages and activity'
                    }
                  </p>
                </div>
                
                <button
                  onClick={handleToggleNotifications}
                  disabled={loading || permissionStatus === 'denied'}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    notificationsEnabled ? 'bg-blue-500' : 'bg-gray-700'
                  } ${loading || permissionStatus === 'denied' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {loading ? (
                    <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                  ) : (
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  )}
                </button>
              </div>

              {permissionStatus === 'denied' && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-300">
                    Notifications are blocked. To enable them:
                  </p>
                  <ol className="mt-2 text-xs text-red-200 space-y-1 ml-4 list-decimal">
                    <li>Open your browser settings</li>
                    <li>Find Site Settings or Permissions</li>
                    <li>Allow notifications for this site</li>
                    <li>Refresh this page</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-800">
          <p className="text-xs text-gray-400 text-center">
            Enable notifications to receive real-time updates about messages, likes, comments, and more.
          </p>
        </div>
      </div>
    </div>
  )
}
