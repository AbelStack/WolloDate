# Push Notifications Setup Guide

## Overview

This guide will help you set up FREE push notifications using Firebase Cloud Messaging (FCM). FCM is 100% free forever with no trial period.

## Prerequisites

✅ Firebase project created: `wollogram-feb31`
✅ Service account JSON key downloaded
✅ Firebase config already added to frontend
✅ All backend files created

## Installation Steps

### 1. Install Dependencies

#### Frontend (run in `frontend/` directory):

```bash
npm install firebase
```

#### Backend (run in `backend/` directory):

```bash
composer require kreait/firebase-php
```

### 2. Backend Configuration

#### A. Store Service Account Key

1. Create directory in backend:

    ```bash
    mkdir -p storage/firebase
    ```

2. Upload your downloaded service account JSON file to:

    ```
    backend/storage/firebase/service-account.json
    ```

3. Set proper permissions (Linux/Mac):

    ```bash
    chmod 600 storage/firebase/service-account.json
    ```

4. Make sure `.gitignore` includes:
    ```
    storage/firebase/
    ```

#### B. Add to .env file

Add these lines to `backend/.env`:

```env
FIREBASE_CREDENTIALS=storage/firebase/service-account.json
FIREBASE_PROJECT_ID=wollogram-feb31
```

### 3. Create Database Table

Open phpMyAdmin and run this SQL:

```sql
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token` varchar(255) NOT NULL,
  `device_type` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_token_unique` (`token`),
  KEY `push_subscriptions_user_id_foreign` (`user_id`),
  CONSTRAINT `push_subscriptions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Or use the file: `backend/database/migrations/create_push_subscriptions_table.sql`

### 4. Files Created

All necessary files have been created:

#### Backend:

- ✅ `config/firebase.php` - Firebase configuration
- ✅ `app/Models/PushSubscription.php` - Database model
- ✅ `app/Http/Controllers/PushSubscriptionController.php` - API endpoints
- ✅ `app/Services/PushNotificationService.php` - Notification sender
- ✅ Routes added to `routes/api.php`
- ✅ Push notifications integrated in `MessageController.php`

#### Frontend:

- ✅ `src/firebase.js` - Firebase initialization
- ✅ `public/firebase-messaging-sw.js` - Service worker
- ✅ `src/utils/notifications.js` - Helper functions
- ✅ `src/components/NotificationPrompt.jsx` - UI component

### 5. Add Notification UI to Your App

You have two options:

#### Option A: Auto-prompt (Recommended)

Add to your main App component:

```jsx
import NotificationPrompt from "./components/NotificationPrompt";

function App() {
    return (
        <>
            <NotificationPrompt />
            {/* Your other components */}
        </>
    );
}
```

#### Option B: Settings Page

Add to your settings page:

```jsx
import { NotificationSettings } from "./components/NotificationPrompt";

function Settings() {
    return (
        <div>
            <h2>Notification Settings</h2>
            <NotificationSettings />
        </div>
    );
}
```

### 6. Testing

After completing the installation:

1. Install dependencies:

    ```bash
    cd frontend && npm install firebase
    cd ../backend && composer require kreait/firebase-php
    ```

2. Create the database table in phpMyAdmin

3. Add Firebase credentials to backend

4. Start your servers:

    ```bash
    # Backend
    cd backend && php artisan serve

    # Frontend
    cd frontend && npm run dev
    ```

5. Open the app in browser (must be HTTPS or localhost)

6. The notification prompt will appear after 3 seconds

7. Click "Enable" to subscribe

8. Send a test message from another account

### 7. Current Integration Status

Push notifications are currently integrated for:

- ✅ New messages (MessageController)

Still need integration for:

- ⏳ Post likes (PostController)
- ⏳ Comments (CommentController)
- ⏳ New followers (FollowController)

To add more integrations, use the `PushNotificationService` methods:

```php
// In your controller
use App\Services\PushNotificationService;

public function __construct(PushNotificationService $pushNotificationService)
{
    $this->pushNotificationService = $pushNotificationService;
}

// Send notification
$this->pushNotificationService->sendLikeNotification($postOwner, $liker, $postId);
$this->pushNotificationService->sendCommentNotification($postOwner, $commenter, $commentText, $postId);
$this->pushNotificationService->sendFollowNotification($followedUser, $follower);
```

### 8. API Endpoints

The following endpoints are now available:

- `GET /api/push-subscriptions` - Get user's subscriptions
- `POST /api/push-subscriptions` - Subscribe to notifications
    ```json
    {
        "token": "fcm-token-here",
        "device_type": "web"
    }
    ```
- `DELETE /api/push-subscriptions` - Unsubscribe from notifications

## Cost Breakdown

- ✅ Firebase Cloud Messaging: FREE forever
- ✅ No limits on number of notifications
- ✅ No credit card required
- ✅ No trial period
- ✅ No hidden costs

## Requirements

- HTTPS connection (or localhost for testing)
- Modern browser with service worker support
- User must grant notification permission

## Troubleshooting

### Service Worker Not Registering

- Make sure `firebase-messaging-sw.js` is in `public/` folder
- Check browser console for errors
- Verify HTTPS is enabled (required for service workers)
- Clear browser cache and reload

### Notifications Not Received

- Check browser notification permissions (browser settings)
- Verify token is saved in database (check `push_subscriptions` table)
- Check backend logs for FCM errors
- Ensure service account JSON is valid and has correct permissions
- Test with browser console: `Notification.permission`

### "Firebase credentials file not found" Error

- Verify file path: `backend/storage/firebase/service-account.json`
- Check file permissions
- Ensure path in `.env` is correct

### Token Already Exists Error

- This is normal if user already subscribed
- The system will update the existing token
- No action needed

### Notifications Work on Desktop but Not Mobile

- Ensure mobile browser supports service workers (Chrome, Firefox, Edge)
- Check if user granted permission on mobile
- iOS Safari has limited support (use Chrome or Firefox on iOS)

## Security Notes

- ⚠️ Service account JSON contains sensitive credentials
- ⚠️ Never commit it to git
- ⚠️ Store it securely on your server
- ⚠️ Restrict file permissions: `chmod 600 storage/firebase/service-account.json`
- ⚠️ Add `storage/firebase/` to `.gitignore`

## Next Steps

1. Complete the installation steps above
2. Test notifications with a friend
3. Add notification integrations for likes, comments, and follows
4. Customize notification messages and icons
5. Add notification preferences in user settings

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review browser console for errors
3. Check backend logs: `storage/logs/laravel.log`
4. Verify Firebase project settings in Firebase Console
