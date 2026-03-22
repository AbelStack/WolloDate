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

// Request permission and subscribe to push notifications
export const subscribeToPushNotifications = async () => {
  try {
    if (!isNotificationSupported()) {
      throw new Error('Push notifications are not supported in this browser')
    }

    console.log('Step 1: Registering service worker...')
    // Register service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    console.log('Service Worker registered:', registration)

    console.log('Step 2: Waiting for service worker to be ready...')
    // Wait for service worker to be ready
    await navigator.serviceWorker.ready

    console.log('Step 3: Requesting notification permission and getting FCM token...')
    // Request permission and get FCM token
    const token = await requestNotificationPermission()
    
    if (!token) {
      throw new Error('Failed to get FCM token')
    }

    console.log('Step 4: Saving token to backend...', token.substring(0, 20) + '...')
    // Save token to backend
    const response = await api.post('/push-subscriptions', { token })
    console.log('Backend response:', response.data)

    console.log('Successfully subscribed to push notifications')
    return token
  } catch (error) {
    console.error('Error subscribing to push notifications:', error)
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    })
    throw error
  }
}

// Unsubscribe from push notifications
export const unsubscribeFromPushNotifications = async () => {
  try {
    // Remove token from backend
    await api.delete('/push-subscriptions')
    
    console.log('Successfully unsubscribed from push notifications')
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error)
    throw error
  }
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
          icon: payload.notification?.icon || '/logo.jpg',
          badge: '/logo.jpg',
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
      icon: '/logo.jpg',
      badge: '/logo.jpg'
    })
  }
}
