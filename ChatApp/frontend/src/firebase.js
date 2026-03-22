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

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: 'BKvcB5lKthPWTy2_BxkUF98Nt43QjOWuBz92tP4vcNV-_ysgpstOcM2Yy_upi8ldB3-V_NQkronUUV95dKceETA'
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
