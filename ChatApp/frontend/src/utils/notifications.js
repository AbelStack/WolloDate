import { requestNotificationPermission, onMessageListener } from '../firebase'
import api from '../api'

// Check if notifications are supported
export const isNotificationSupported = () => {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

// Get current notification permission status
export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

// Check if notification prompt should be shown (based on dismissal time)
export const shouldShowNotificationPrompt = () => {
  const permission = getNotificationPermission()
  
  // Don't show if already granted or unsupported
  if (permission === 'granted' || permission === 'unsupported') {
    return false
  }
  
  // Don't show if permanently denied
  if (permission === 'denied') {
    return false
  }
  
  // Check if user dismissed the prompt recently
  const dismissedAt = localStorage.getItem('notificationPromptDismissedAt')
  if (dismissedAt) {
    const dismissedTime = new Date(dismissedAt).getTime()
    const now = Date.now()
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000 // 2 days
    
    // Show again if more than 2 days have passed
    return (now - dismissedTime) > twoDaysInMs
  }
  
  // Show if never dismissed
  return true
}

// Mark notification prompt as dismissed
export const dismissNotificationPrompt = () => {
  localStorage.setItem('notificationPromptDismissedAt', new Date().toISOString())
}

// Check if notifications are currently enabled
export const isNotificationEnabled = () => {
  return localStorage.getItem('notificationEnabled') === 'true' && Notification.permission === 'granted'
}

// Request permission and subscribe to push notifications
export const subscribeToPushNotifications = async () => {
  try {
    if (!isNotificationSupported()) {
      throw new Error('Push notifications are not supported in this browser')
    }

    console.log('Step 1: Registering service worker...')
    // Check if service worker is already registered
    let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
    if (registration) {
      console.log('Service Worker already registered, updating...')
      await registration.update()
    } else {
      console.log('Registering new Service Worker...')
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    }
    console.log('Service Worker registered:', registration)

    console.log('Step 2: Waiting for service worker to be ready...')
    await navigator.serviceWorker.ready

    console.log('Step 3: Requesting notification permission and getting FCM token...')
    // Request permission and get FCM token
    const token = await requestNotificationPermission()
    
    if (!token) {
      throw new Error('Failed to get FCM token')
    }

    console.log('Step 4: Saving token to backend...', token.substring(0, 20) + '...')
    
    // Retry logic for backend save
    let retries = 3
    let lastError = null
    
    while (retries > 0) {
      try {
        const response = await api.post('/push-subscriptions', { token })
        console.log('Backend response:', response.data)
        
        // Clear any dismissal flag on successful subscription
        localStorage.removeItem('notificationPromptDismissedAt')
        localStorage.setItem('notificationEnabled', 'true')
        
        console.log('Successfully subscribed to push notifications')
        return token
      } catch (error) {
        lastError = error
        retries--
        
        if (retries > 0) {
          console.log(`Retry saving token, ${retries} attempts left...`)
          await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before retry
        }
      }
    }
    
    // If all retries failed, throw the last error
    throw lastError
    
  } catch (error) {
    console.error('Error subscribing to push notifications:', error)
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    })
    
    // Provide user-friendly error messages
    if (error.message.includes('not supported')) {
      throw new Error('Your browser does not support push notifications')
    } else if (error.message.includes('permission')) {
      throw new Error('Notification permission was denied')
    } else if (error.response?.status === 401) {
      throw new Error('Please log in again to enable notifications')
    } else if (error.response?.status >= 500) {
      throw new Error('Server error. Please try again later')
    }
    
    throw error
  }
}

// Unsubscribe from push notifications
export const unsubscribeFromPushNotifications = async () => {
  try {
    // Remove token from backend
    await api.delete('/push-subscriptions')
    
    // Clear local storage flags
    localStorage.removeItem('notificationEnabled')
    
    console.log('Successfully unsubscribed from push notifications')
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error)
    throw error
  }
}

// Auto-enable notifications when PWA is installed
export const setupPWANotificationAutoEnable = () => {
  window.addEventListener('appinstalled', async () => {
    console.log('PWA installed, auto-enabling notifications...')
    
    try {
      // Wait a bit for the app to settle
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Automatically request notification permission
      await subscribeToPushNotifications()
      
      console.log('Notifications auto-enabled on PWA install')
    } catch (error) {
      console.log('Could not auto-enable notifications on PWA install:', error.message)
      // Don't throw - this is a nice-to-have feature
    }
  })
}

// Listen for foreground messages
export const setupForegroundMessageListener = (onNotification) => {
  onMessageListener()
    .then((payload) => {
      console.log('Received foreground message:', payload)
      
      // Show browser notification
      if (Notification.permission === 'granted') {
        const notificationTitle = payload.notification?.title || 'WolloGram'
        const notificationOptions = {
          body: payload.notification?.body || 'You have a new notification',
          icon: payload.notification?.icon || '/logo.png',
          badge: '/logo.png',
          tag: payload.data?.type || 'default',
          data: payload.data
        }
        
        new Notification(notificationTitle, notificationOptions)
      }
      
      // Call callback
      if (onNotification) {
        onNotification(payload)
      }
    })
    .catch((err) => console.log('Failed to receive foreground message:', err))
}

// Show a test notification
export const showTestNotification = () => {
  if (Notification.permission === 'granted') {
    new Notification('WolloGram', {
      body: 'Push notifications are working! 🎉',
      icon: '/logo.png',
      badge: '/logo.png'
    })
  }
}
