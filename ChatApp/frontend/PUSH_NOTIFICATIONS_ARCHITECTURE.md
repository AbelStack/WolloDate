# Push Notifications Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         WolloGram App                            │
│                    (React Frontend + Laravel Backend)            │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
        ┌───────────────────┐     ┌──────────────────┐
        │   Frontend        │     │    Backend       │
        │   (React)         │     │    (Laravel)     │
        └───────────────────┘     └──────────────────┘
                    │                         │
                    │                         │
                    ▼                         ▼
        ┌───────────────────┐     ┌──────────────────┐
        │  Firebase SDK     │     │  Firebase Admin  │
        │  (Client)         │     │  SDK (Server)    │
        └───────────────────┘     └──────────────────┘
                    │                         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  Firebase Cloud        │
                    │  Messaging (FCM)       │
                    │  [FREE FOREVER]        │
                    └────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  User's Device         │
                    │  (Browser/Mobile)      │
                    └────────────────────────┘
```

---

## Data Flow

### 1. User Subscribes to Notifications

```
User Opens App
     │
     ▼
NotificationPrompt Component Shows
     │
     ▼
User Clicks "Enable"
     │
     ▼
Browser Requests Permission
     │
     ▼
User Grants Permission
     │
     ▼
Firebase SDK Generates FCM Token
     │
     ▼
Token Sent to Backend API
     │
     ▼
Backend Saves Token to Database
     │
     ▼
User is Now Subscribed! ✅
```

### 2. Sending a Notification

```
User A Sends Message to User B
     │
     ▼
Backend MessageController Receives Request
     │
     ▼
Message Saved to Database
     │
     ▼
PushNotificationService Called
     │
     ▼
Service Fetches User B's FCM Token
     │
     ▼
Service Sends Notification to Firebase
     │
     ▼
Firebase Delivers to User B's Device
     │
     ▼
User B Sees Notification 🔔
     │
     ▼
User B Clicks Notification
     │
     ▼
App Opens to Conversation
```

---

## Component Architecture

### Frontend Components

```
App.jsx
  │
  ├─ NotificationPrompt.jsx
  │    │
  │    ├─ Uses: notifications.js
  │    └─ Uses: firebase.js
  │
  └─ Other Components
       │
       └─ Can use: notifications.js (for manual subscription)

firebase-messaging-sw.js (Service Worker)
  │
  ├─ Handles Background Notifications
  ├─ Handles Click Events
  └─ Routes to Correct Page
```

### Backend Components

```
MessageController.php
  │
  ├─ Injects: PushNotificationService
  │
  └─ Calls: sendMessageNotification()
       │
       └─ PushNotificationService.php
            │
            ├─ Uses: Firebase Admin SDK
            ├─ Fetches: PushSubscription Model
            └─ Sends: Notification via FCM

PushSubscriptionController.php
  │
  ├─ store() - Save FCM Token
  ├─ destroy() - Remove Token
  └─ index() - List Tokens
       │
       └─ PushSubscription Model
            │
            └─ Database: push_subscriptions table
```

---

## Database Schema

```
push_subscriptions
├─ id (bigint, primary key)
├─ user_id (bigint, foreign key → users.id)
├─ token (varchar, unique)
├─ device_type (varchar, nullable)
├─ created_at (timestamp)
└─ updated_at (timestamp)

Indexes:
- Primary: id
- Unique: token
- Foreign: user_id → users(id) ON DELETE CASCADE
```

---

## API Endpoints

```
GET    /api/push-subscriptions
       ├─ Auth: Required
       ├─ Returns: User's subscriptions
       └─ Used by: Settings page

POST   /api/push-subscriptions
       ├─ Auth: Required
       ├─ Body: { token, device_type? }
       ├─ Returns: Subscription created/updated
       └─ Used by: NotificationPrompt component

DELETE /api/push-subscriptions
       ├─ Auth: Required
       ├─ Body: { token? }
       ├─ Returns: Success message
       └─ Used by: Settings page, logout
```

---

## Notification Types

### Currently Implemented

```
Message Notification
├─ Title: Sender Name
├─ Body: Message Preview
├─ Icon: Sender Avatar
├─ Data:
│   ├─ type: "message"
│   ├─ conversationId: "123"
│   ├─ senderId: "456"
│   ├─ senderName: "John"
│   └─ senderAvatar: "url"
└─ Click Action: Open conversation
```

### Ready to Implement

```
Like Notification
├─ Title: "New Like"
├─ Body: "John liked your post"
├─ Data:
│   ├─ type: "like"
│   ├─ postId: "789"
│   ├─ likerId: "456"
│   └─ likerName: "John"
└─ Click Action: Open post

Comment Notification
├─ Title: "New Comment"
├─ Body: "John: Great post!"
├─ Data:
│   ├─ type: "comment"
│   ├─ postId: "789"
│   ├─ commenterId: "456"
│   └─ commenterName: "John"
└─ Click Action: Open post

Follow Notification
├─ Title: "New Follower"
├─ Body: "John started following you"
├─ Data:
│   ├─ type: "follow"
│   ├─ userId: "456"
│   ├─ userName: "John"
│   └─ userAvatar: "url"
└─ Click Action: Open profile
```

---

## Security Flow

```
Service Account JSON
     │
     ├─ Stored: backend/storage/firebase/
     ├─ Permissions: 600 (read/write owner only)
     ├─ Git: Ignored (.gitignore)
     └─ Used by: Firebase Admin SDK
          │
          └─ Authenticates Backend with Firebase
               │
               └─ Allows Sending Notifications
```

---

## Error Handling

```
Token Management
     │
     ├─ Invalid Token Detected
     │   └─ Automatically Deleted from Database
     │
     ├─ Token Not Found
     │   └─ User Not Subscribed (No Error)
     │
     └─ Firebase Error
         └─ Logged to Backend Logs
```

---

## Scalability

```
Current Setup (Free Tier)
├─ Unlimited Notifications
├─ Unlimited Users
├─ Unlimited Devices
└─ No Rate Limits

Performance
├─ Async Notification Sending
├─ Batch Sending for Multiple Users
├─ Automatic Token Cleanup
└─ Database Indexed for Fast Queries
```

---

## Browser Support Matrix

```
Desktop Browsers
├─ Chrome      ✅ Full Support
├─ Firefox     ✅ Full Support
├─ Edge        ✅ Full Support
├─ Opera       ✅ Full Support
└─ Safari      ⚠️  Limited Support

Mobile Browsers
├─ Chrome (Android)      ✅ Full Support
├─ Firefox (Android)     ✅ Full Support
├─ Samsung Internet      ✅ Full Support
├─ Safari (iOS)          ⚠️  Limited Support
└─ Chrome (iOS)          ⚠️  Limited Support

Requirements
├─ HTTPS Connection (or localhost)
├─ Service Worker Support
└─ Notification API Support
```

---

## Configuration Files

```
Frontend
├─ firebase.js
│   ├─ Firebase Config
│   ├─ API Keys
│   ├─ Project ID
│   └─ VAPID Key
│
└─ firebase-messaging-sw.js
    ├─ Service Worker Config
    └─ Background Message Handler

Backend
├─ config/firebase.php
│   ├─ Credentials Path
│   └─ Project ID
│
└─ .env
    ├─ FIREBASE_CREDENTIALS
    └─ FIREBASE_PROJECT_ID
```

---

## Testing Flow

```
Development Testing
     │
     ├─ 1. Start Backend Server
     ├─ 2. Start Frontend Server
     ├─ 3. Open in Browser (HTTPS/localhost)
     ├─ 4. Grant Permission
     ├─ 5. Check Token in Database
     ├─ 6. Send Test Message
     └─ 7. Verify Notification Received

Production Testing
     │
     ├─ 1. Deploy Backend
     ├─ 2. Deploy Frontend
     ├─ 3. Upload Service Account JSON
     ├─ 4. Configure .env
     ├─ 5. Test with Real Users
     └─ 6. Monitor Logs
```

---

## Monitoring & Logs

```
Backend Logs
├─ Location: storage/logs/laravel.log
├─ Contains:
│   ├─ Firebase Initialization Errors
│   ├─ Token Save/Delete Events
│   ├─ Notification Send Success/Failure
│   └─ Invalid Token Cleanup

Frontend Logs
├─ Location: Browser Console
├─ Contains:
│   ├─ Service Worker Registration
│   ├─ Token Generation
│   ├─ Permission Status
│   └─ Notification Received Events

Firebase Console
├─ Location: console.firebase.google.com
├─ Contains:
│   ├─ Message Delivery Stats
│   ├─ Error Rates
│   └─ Active Tokens
```

---

## Cost Breakdown

```
Firebase Cloud Messaging
├─ Monthly Cost: $0.00
├─ Per Notification: $0.00
├─ Setup Fee: $0.00
├─ Maintenance Fee: $0.00
└─ Total: FREE FOREVER ✅

No Hidden Costs
├─ No Credit Card Required
├─ No Trial Period
├─ No Usage Limits
└─ No Surprise Charges
```

---

## Future Enhancements

```
Planned Features
├─ Notification Preferences
│   ├─ Enable/Disable by Type
│   ├─ Quiet Hours
│   └─ Sound Preferences
│
├─ Notification History
│   ├─ View Past Notifications
│   └─ Mark as Read
│
├─ Rich Notifications
│   ├─ Images
│   ├─ Action Buttons
│   └─ Custom Sounds
│
└─ Analytics
    ├─ Delivery Rates
    ├─ Click Rates
    └─ User Engagement
```

---

This architecture is designed to be:

- ✅ Scalable
- ✅ Secure
- ✅ Free Forever
- ✅ Easy to Maintain
- ✅ Production Ready
