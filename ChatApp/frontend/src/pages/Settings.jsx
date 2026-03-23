import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, BellOff, Loader2, Bug, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { 
  subscribeToPushNotifications, 
  unsubscribeFromPushNotifications,
  getNotificationPermission,
  isNotificationSupported,
  showTestNotification
} from '../utils/notifications'

export default function Settings() {
  const navigate = useNavigate()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState('default')
  const [showDebug, setShowDebug] = useState(false)
  const [debugInfo, setDebugInfo] = useState({
    swVersion: 'Checking...',
    swStatus: 'Checking...',
    logoTest: 'Not tested',
    corsTest: 'Not tested'
  })
  const [debugLoading, setDebugLoading] = useState(false)

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

  const checkServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      return { version: 'Not supported', status: 'Not available' }
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (registrations.length === 0) {
        return { version: 'Not registered', status: 'Inactive' }
      }

      const reg = registrations[0]
      const scriptURL = reg.active?.scriptURL || 'Unknown'
      
      // Try to detect version from console logs or script content
      return {
        version: scriptURL.includes('firebase-messaging-sw') ? 'Active' : 'Unknown',
        status: reg.active ? 'Active' : 'Inactive',
        scope: reg.scope
      }
    } catch (error) {
      return { version: 'Error', status: error.message }
    }
  }

  const testLogo = async () => {
    try {
      const response = await fetch('/logo.png', { method: 'HEAD' })
      return response.ok ? 'OK' : 'Failed'
    } catch {
      return 'Failed'
    }
  }

  const testCORS = async () => {
    try {
      const response = await fetch('/logo.png', { method: 'HEAD' })
      const cors = response.headers.get('access-control-allow-origin')
      return cors ? 'Enabled' : 'Missing'
    } catch {
      return 'Failed'
    }
  }

  const runDiagnostics = async () => {
    setDebugLoading(true)
    try {
      const [swInfo, logoStatus, corsStatus] = await Promise.all([
        checkServiceWorker(),
        testLogo(),
        testCORS()
      ])

      setDebugInfo({
        swVersion: swInfo.version,
        swStatus: swInfo.status,
        logoTest: logoStatus,
        corsTest: corsStatus
      })
    } catch (error) {
      console.error('Diagnostics failed:', error)
    } finally {
      setDebugLoading(false)
    }
  }

  const unregisterServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      alert('Service Workers not supported')
      return
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (registrations.length === 0) {
        alert('No service workers to unregister')
        return
      }

      for (const reg of registrations) {
        await reg.unregister()
      }

      alert('Service worker unregistered! Please close and reopen your browser for changes to take effect.')
      await runDiagnostics()
    } catch (error) {
      alert('Failed to unregister service worker: ' + error.message)
    }
  }

  const handleTestNotification = () => {
    if (permissionStatus !== 'granted') {
      alert('Please enable notifications first')
      return
    }
    showTestNotification()
  }

  useEffect(() => {
    if (showDebug) {
      runDiagnostics()
    }
  }, [showDebug])

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

        {/* Debug Section */}
        <div className="mt-6">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 rounded-xl border border-gray-800 hover:bg-gray-800 transition"
          >
            <div className="flex items-center gap-2">
              <Bug size={18} />
              <span className="font-medium">Notification Debug Tools</span>
            </div>
            <span className="text-xs text-gray-500">
              {showDebug ? 'Hide' : 'Show'}
            </span>
          </button>

          {showDebug && (
            <div className="mt-4 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="font-semibold text-sm">Diagnostics</h3>
              </div>

              <div className="p-4 space-y-3">
                {/* Status Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Service Worker:</span>
                    <span className={`flex items-center gap-1 ${
                      debugInfo.swStatus === 'Active' ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {debugInfo.swStatus === 'Active' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                      {debugInfo.swStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Logo File:</span>
                    <span className={`flex items-center gap-1 ${
                      debugInfo.logoTest === 'OK' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {debugInfo.logoTest === 'OK' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {debugInfo.logoTest}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">CORS Headers:</span>
                    <span className={`flex items-center gap-1 ${
                      debugInfo.corsTest === 'Enabled' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {debugInfo.corsTest === 'Enabled' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {debugInfo.corsTest}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-gray-800 space-y-2">
                  <button
                    onClick={runDiagnostics}
                    disabled={debugLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
                  >
                    {debugLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    Run Diagnostics
                  </button>

                  <button
                    onClick={handleTestNotification}
                    disabled={permissionStatus !== 'granted'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
                  >
                    <Bell size={16} />
                    Test Notification
                  </button>

                  <button
                    onClick={unregisterServiceWorker}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition"
                  >
                    <XCircle size={16} />
                    Unregister Service Worker
                  </button>
                </div>

                {/* Instructions */}
                <div className="pt-3 border-t border-gray-800">
                  <p className="text-xs text-gray-400 mb-2">
                    <strong className="text-gray-300">Fix notification logo:</strong>
                  </p>
                  <ol className="text-xs text-gray-400 space-y-1 ml-4 list-decimal">
                    <li>Click "Unregister Service Worker"</li>
                    <li>Close browser completely</li>
                    <li>Reopen browser and visit app</li>
                    <li>Click "Test Notification" to verify</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
