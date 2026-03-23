// Firebase Cloud Messaging Service Worker v2.0
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')

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

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload)

  const notificationTitle = payload.notification?.title || 'WolloGram'
  
  // Force logo URL - use absolute URL
  const logoUrl = 'https://wollogram.vercel.app/logo.png'
  
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: logoUrl,
    badge: logoUrl,
    tag: payload.data?.messageId || payload.data?.type || 'default',
    data: payload.data,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    image: logoUrl
  }

  // Add action buttons based on notification type
  if (payload.data?.type === 'message' || payload.data?.type === 'story_reply') {
    notificationOptions.actions = [
      { action: 'open', title: 'Open Chat' },
      { action: 'close', title: 'Dismiss' }
    ]
  } else if (payload.data?.type === 'like' || payload.data?.type === 'comment') {
    notificationOptions.actions = [
      { action: 'open', title: 'View Post' },
      { action: 'close', title: 'Dismiss' }
    ]
  } else if (payload.data?.type === 'story_like') {
    notificationOptions.actions = [
      { action: 'open', title: 'View Story' },
      { action: 'close', title: 'Dismiss' }
    ]
  } else if (payload.data?.type === 'follow') {
    notificationOptions.actions = [
      { action: 'open', title: 'View Profile' },
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
