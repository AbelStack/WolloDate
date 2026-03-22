# Quick Start: Push Notifications

Get push notifications working in 5 minutes!

## Step 1: Install Dependencies (2 minutes)

```bash
# Frontend
cd frontend
npm install firebase

# Backend
cd ../backend
composer require kreait/firebase-php
```

## Step 2: Upload Service Account (1 minute)

1. Create folder: `backend/storage/firebase/`
2. Upload your downloaded JSON file as: `service-account.json`

## Step 3: Configure Backend (1 minute)

Add to `backend/.env`:

```env
FIREBASE_CREDENTIALS=storage/firebase/service-account.json
FIREBASE_PROJECT_ID=wollogram-feb31
```

## Step 4: Create Database Table (1 minute)

Copy this SQL and run in phpMyAdmin:

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

## Step 5: Test! (30 seconds)

1. Start servers:

   ```bash
   # Backend
   php artisan serve

   # Frontend (in another terminal)
   npm run dev
   ```

2. Open app in browser
3. Click "Enable" when notification prompt appears
4. Send a message from another account
5. You should get a notification! 🎉

## That's It!

You now have working push notifications for messages.

## What's Next?

- Read full guide: `backend/PUSH_NOTIFICATIONS_SETUP.md`
- Add more notification types (likes, comments, follows)
- Customize notification messages
- Add notification settings page

## Need Help?

Check:

- `PUSH_NOTIFICATIONS_CHECKLIST.md` - Step-by-step checklist
- `PUSH_NOTIFICATIONS_COMPLETE.md` - What was implemented
- `backend/PUSH_NOTIFICATIONS_SETUP.md` - Detailed guide with troubleshooting

## Cost

**100% FREE FOREVER** ✅

- No credit card required
- No trial period
- No limits on notifications
