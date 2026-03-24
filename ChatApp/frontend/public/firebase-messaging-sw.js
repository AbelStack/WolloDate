// Firebase Cloud Messaging Service Worker v5.0 - Logo Fix
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')

const SW_VERSION = 'v5.0'

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyAptdvMOpKIRG612AR3-E5RT6iDkI0xH74",
  authDomain: "wollogram-feb31.firebaseapp.com",
  projectId: "wollogram-feb31",
  storageBucket: "wollogram-feb31.firebasestorage.app",
  messagingSenderId: "702251461708",
  appId: "1:702251461708:web:22b0ef50897001d537d8e9"
})

const messaging = firebase.messaging()

// Use absolute URLs for icons - critical for Android notifications
const ICON_URL = 'https://wollogram.vercel.app/logo-v3.png'
const BADGE_URL = 'https://wollogram.vercel.app/logo-v3.png'

// Preload icons on install
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`)
  event.waitUntil(
    Promise.all([
      // Cache icons
      caches.open('notification-icons-v2').then((cache) => {
        return cache.addAll([ICON_URL, BADGE_URL]).catch(err => {
          console.error('[SW] Failed to cache icons:', err)
          // Don't fail install if caching fails
        })
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  )
})

// Take control immediately
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating...`)
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('notification-icons-') && name !== 'notification-icons-v2')
            .map(name => caches.delete(name))
        )
      }),
      // Take control of all clients
      clients.claim()
    ]).then(() => {
      console.log(`[SW ${SW_VERSION}] Now controlling all clients`)
    })
  )
})

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log(`[SW ${SW_VERSION}] Received background message:`, payload)

  const notificationTitle = payload.notification?.title || 'WolloGram'
  
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: ICON_URL,
    badge: BADGE_URL,
    tag: payload.data?.messageId || payload.data?.type || 'default',
    data: payload.data || {},
    requireInteraction: false,
    vibrate: [200, 100, 200],
    renotify: false,
    silent: false,
    // Critical for Android - ensure image is loaded
    image: payload.notification?.image || undefined
  }

  // Add action buttons based on notification type
  if (payload.data?.type === 'message' || payload.data?.type === 'story_reply') {
    notificationOptions.actions = [
      { action: 'open', title: 'Open Chat', icon: ICON_URL },
      { action: 'close', title: 'Dismiss' }
    ]
  } else if (payload.data?.type === 'like' || payload.data?.type === 'comment') {
    notificationOptions.actions = [
      { action: 'open', title: 'View Post', icon: ICON_URL },
      { action: 'close', title: 'Dismiss' }
    ]
  } else if (payload.data?.type === 'story_like') {
    notificationOptions.actions = [
      { action: 'open', title: 'View Story', icon: ICON_URL },
      { action: 'close', title: 'Dismiss' }
    ]
  } else if (payload.data?.type === 'follow') {
    notificationOptions.actions = [
      { action: 'open', title: 'View Profile', icon: ICON_URL },
      { action: 'close', title: 'Dismiss' }
    ]
  }

  return self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event)
  
  event.notification.close()

  const data = event.notification.data || {}
  let urlToOpen = '/'

  // Determine URL based on notification type
  if (data.type === 'message' && data.conversationId) {
    urlToOpen = `/c/${data.conversationId}`
  } else if (data.type === 'story_reply' && data.conversationId) {
    urlToOpen = `/c/${data.conversationId}`
  } else if (data.type === 'comment' && data.postId) {
    urlToOpen = `/post/${data.postId}`
  } else if (data.type === 'like' && data.postId) {
    urlToOpen = `/post/${data.postId}`
  } else if (data.type === 'story_like' && data.storyId) {
    urlToOpen = `/stories/${data.storyId}`
  } else if (data.type === 'follow' && data.userId) {
    urlToOpen = `/profile/${data.userId}`
  } else if (data.url) {
    urlToOpen = data.url
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            url: urlToOpen,
            data: data
          })
          return
        }
      }
      
      // Open new window if app is not open
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})
