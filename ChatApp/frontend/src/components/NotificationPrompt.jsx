import { useState, useEffect } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { 
  subscribeToPushNotifications, 
  unsubscribeFromPushNotifications,
  getNotificationPermission,
  isNotificationSupported,
  shouldShowNotificationPrompt,
  dismissNotificationPrompt,
  isNotificationEnabled,
  setupPWANotificationAutoEnable
} from '../utils/notifications'

export default function NotificationPrompt() {
  const [permission, setPermission] = useState('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Setup PWA auto-enable
    setupPWANotificationAutoEnable()
    
    // Check if notifications are supported
    if (!isNotificationSupported()) {
      return
    }

    // Get current permission status
    const currentPermission = getNotificationPermission()
    setPermission(currentPermission)

    // Check if already subscribed
    if (currentPermission === 'granted' && isNotificationEnabled()) {
      setIsSubscribed(true)
      return
    }

    // Show prompt based on reminder logic (2 days after dismissal)
    if (shouldShowNotificationPrompt()) {
      // Show prompt after 3 seconds
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleSubscribe = async () => {
    // Prevent double-clicks
    if (loading) return
    
    try {
      setLoading(true)
      console.log('Starting subscription...')
      await subscribeToPushNotifications()
      console.log('Subscription successful!')
      setPermission('granted')
      setIsSubscribed(true)
      setShowPrompt(false)
    } catch (error) {
      console.error('Failed to subscribe:', error)
      console.error('Error details:', error.message, error.response?.data)
      
      // Show user-friendly error message
      let errorMessage = 'Failed to enable notifications'
      if (error.message.includes('not supported')) {
        errorMessage = 'Your browser does not support notifications'
      } else if (error.message.includes('denied')) {
        errorMessage = 'Notification permission was denied. Please enable it in your browser settings.'
      } else if (error.message.includes('log in')) {
        errorMessage = 'Please log in again to enable notifications'
      } else if (error.message.includes('Server error')) {
        errorMessage = 'Server error. Please try again later.'
      }
      
      alert(errorMessage)
      
      if (error.message.includes('denied')) {
        setPermission('denied')
        setShowPrompt(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUnsubscribe = async () => {
    try {
      setLoading(true)
      await unsubscribeFromPushNotifications()
      setIsSubscribed(false)
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    dismissNotificationPrompt()
  }

  // Don't render if not supported
  if (!isNotificationSupported()) {
    return null
  }

  // Show prompt banner
  if (showPrompt && permission === 'default') {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 mx-auto max-w-md px-4 animate-slide-down">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-2xl p-4 flex items-start gap-3 border-2 border-blue-400">
          <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-lg mb-1">🔔 Stay Updated!</p>
            <p className="text-sm text-blue-50 mb-3">
              Get instant notifications for messages, likes, comments, and more. Never miss a moment!
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-white text-blue-600 rounded-md text-sm font-bold hover:bg-blue-50 disabled:opacity-50 shadow-md transition-all hover:scale-105"
              >
                {loading ? 'Enabling...' : '✓ Enable Notifications'}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-blue-700 text-white rounded-md text-sm font-medium hover:bg-blue-800 transition-all"
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-blue-100 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  // Show settings button (can be placed in settings page)
  return null
}

// Export a settings component that can be used in settings page
export function NotificationSettings() {
  const [permission, setPermission] = useState('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isNotificationSupported()) {
      return
    }

    const currentPermission = getNotificationPermission()
    setPermission(currentPermission)
    setIsSubscribed(currentPermission === 'granted')
  }, [])

  const handleToggle = async () => {
    if (isSubscribed) {
      try {
        setLoading(true)
        await unsubscribeFromPushNotifications()
        setIsSubscribed(false)
      } catch (error) {
        console.error('Failed to unsubscribe:', error)
      } finally {
        setLoading(false)
      }
    } else {
      try {
        setLoading(true)
        await subscribeToPushNotifications()
        setPermission('granted')
        setIsSubscribed(true)
      } catch (error) {
        console.error('Failed to subscribe:', error)
        if (error.message.includes('denied')) {
          setPermission('denied')
        }
      } finally {
        setLoading(false)
      }
    }
  }

  if (!isNotificationSupported()) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Push notifications are not supported in this browser
        </p>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <div className="flex items-start gap-3">
          <BellOff className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div>
            <p className="font-medium text-red-900 dark:text-red-100 mb-1">
              Notifications Blocked
            </p>
            <p className="text-sm text-red-700 dark:text-red-300">
              You have blocked notifications. To enable them, please update your browser settings.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            Push Notifications
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Get notified about messages and activity
          </p>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isSubscribed ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isSubscribed ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
