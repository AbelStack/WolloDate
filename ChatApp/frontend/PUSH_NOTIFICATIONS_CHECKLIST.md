# Push Notifications Setup Checklist

Use this checklist to track your progress setting up push notifications.

## Installation Checklist

### Backend Setup

- [ ] Install Firebase PHP SDK: `composer require kreait/firebase-php`
- [ ] Create directory: `backend/storage/firebase/`
- [ ] Upload service account JSON to: `backend/storage/firebase/service-account.json`
- [ ] Set file permissions (Linux/Mac): `chmod 600 storage/firebase/service-account.json`
- [ ] Add to `.env`:
  - [ ] `FIREBASE_CREDENTIALS=storage/firebase/service-account.json`
  - [ ] `FIREBASE_PROJECT_ID=wollogram-feb31`
- [ ] Create database table in phpMyAdmin (SQL in `backend/database/migrations/create_push_subscriptions_table.sql`)
- [ ] Verify table created: Check `push_subscriptions` table exists

### Frontend Setup

- [ ] Install Firebase: `npm install firebase`
- [ ] Verify files exist:
  - [ ] `src/firebase.js`
  - [ ] `public/firebase-messaging-sw.js`
  - [ ] `src/utils/notifications.js`
  - [ ] `src/components/NotificationPrompt.jsx`
- [ ] Add `NotificationPrompt` component to `App.jsx` (optional)

### Testing

- [ ] Start backend server: `php artisan serve`
- [ ] Start frontend server: `npm run dev`
- [ ] Open app in browser (HTTPS or localhost)
- [ ] Notification prompt appears after 3 seconds
- [ ] Click "Enable" and grant permission
- [ ] Check browser console for errors
- [ ] Verify token saved in database
- [ ] Send test message from another account
- [ ] Receive notification successfully

## Verification Steps

### Backend Verification

```bash
# Check if Firebase package is installed
composer show kreait/firebase-php

# Check if service account file exists
ls -la backend/storage/firebase/service-account.json

# Check .env file
grep FIREBASE backend/.env
```

### Frontend Verification

```bash
# Check if Firebase is installed
npm list firebase

# Check if service worker file exists
ls -la frontend/public/firebase-messaging-sw.js
```

### Database Verification

Run in phpMyAdmin:

```sql
-- Check if table exists
SHOW TABLES LIKE 'push_subscriptions';

-- Check table structure
DESCRIBE push_subscriptions;

-- Check if tokens are being saved
SELECT * FROM push_subscriptions;
```

### Browser Verification

Open browser console and run:

```javascript
// Check notification permission
console.log("Permission:", Notification.permission);

// Check if service worker is registered
navigator.serviceWorker
  .getRegistrations()
  .then((regs) => console.log("Service Workers:", regs));
```

## Troubleshooting Checklist

If notifications don't work, check:

- [ ] HTTPS is enabled (or using localhost)
- [ ] Browser supports notifications (Chrome, Firefox, Edge)
- [ ] Notification permission is granted (check browser settings)
- [ ] Service worker is registered (check browser console)
- [ ] Firebase credentials file exists and is valid
- [ ] Database table is created
- [ ] Token is saved in database
- [ ] Backend logs show no errors (`storage/logs/laravel.log`)
- [ ] Frontend console shows no errors
- [ ] Firebase project is active in Firebase Console

## Integration Checklist

### Current Integrations

- [x] New messages (MessageController)

### Pending Integrations

- [ ] Post likes (PostController)
- [ ] Comments (CommentController)
- [ ] New followers (FollowController)
- [ ] Story replies (StoryController)
- [ ] Mentions (various controllers)

## Next Steps After Setup

- [ ] Test notifications with multiple users
- [ ] Add notification preferences in settings
- [ ] Customize notification messages
- [ ] Add notification icons/images
- [ ] Implement notification history
- [ ] Add sound preferences
- [ ] Test on mobile devices
- [ ] Add notification badges
- [ ] Implement do-not-disturb mode

## Notes

Date Started: ******\_\_\_******
Date Completed: ******\_\_\_******

Issues Encountered:

---

---

---

Solutions Applied:

---

---

---
