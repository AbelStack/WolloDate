import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyAptdvMOpKIRG612AR3-E5RT6iDkI0xH74",
  authDomain: "wollogram-feb31.firebaseapp.com",
  projectId: "wollogram-feb31",
  storageBucket: "wollogram-feb31.firebasestorage.app",
  messagingSenderId: "702251461708",
  appId: "1:702251461708:web:22b0ef50897001d537d8e9"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase Cloud Messaging
let messaging = null
try {
  messaging = getMessaging(app)
} catch (err) {
  console.log('Firebase messaging not supported:', err)
}

// Request notification permission and get FCM token
export const requestNotificationPermission = async () => {
  try {
    if (!messaging) {
      throw new Error('Messaging not supported')
    }

    // Check if notifications are supported
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications')
    }

    // Check current permission
    if (Notification.permission === 'denied') {
      throw new Error('Notification permission denied')
    }

    // Request permission
    const permission = await Notification.requestPermission()
    
    if (permission !== 'granted') {
      throw new Error('Notification permission not granted')
    }

    // CRITICAL FIX: Check if we already have a valid token stored
    // This prevents Firebase from generating new tokens unnecessarily
    const existingToken = localStorage.getItem('fcmToken')
    if (existingToken) {
      console.log('Reusing existing FCM token:', existingToken.substring(0, 20) + '...')
      
      // Verify the token is still valid by attempting to get current token
      // If service worker was updated, this will return a new token
      try {
        const currentToken = await getToken(messaging, {
          vapidKey: 'BKvcB5lKthPWTy2_BxkUF98Nt43QjOVuBz92tP4v6NV-_ysgpstOcM2Yy_upi8ldB3-V_NQkronUUV95dKceETA'
        })
        
        // If token hasn't changed, return existing one
        if (currentToken === existingToken) {
          console.log('Token verified and unchanged')
          return existingToken
        }
        
        // Token changed (service worker update or token refresh)
        console.log('Token changed, old will be replaced')
        return currentToken
      } catch (err) {
        console.log('Token verification failed, getting new token:', err.message)
        // Fall through to get new token
      }
    }

    // Get new FCM token (only if no existing token or verification failed)
    console.log('Requesting new FCM token...')
    const token = await getToken(messaging, {
      vapidKey: 'BKvcB5lKthPWTy2_BxkUF98Nt43QjOVuBz92tP4v6NV-_ysgpstOcM2Yy_upi8ldB3-V_NQkronUUV95dKceETA'
    })

    return token
  } catch (error) {
    console.error('Error getting notification permission:', error)
    throw error
  }
}

// Listen for foreground messages
export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) {
      return
    }
    onMessage(messaging, (payload) => {
      resolve(payload)
    })
  })

export { messaging }
