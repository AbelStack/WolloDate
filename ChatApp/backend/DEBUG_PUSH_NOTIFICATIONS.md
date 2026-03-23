# Push Notifications Debugging Guide

## Current Status
✅ Frontend subscription working - token saved to database (user_id: 3)
❌ Test notification endpoint returns 500 error
🔍 Need to debug on production cPanel server

---

## Step 1: Check Backend Logs on cPanel

### Access Laravel Logs
1. Login to cPanel File Manager
2. Navigate to: `public_html/backend/storage/logs/`
3. Open `laravel.log` (download if too large)
4. Search for recent errors containing:
   - "Firebase"
   - "PushNotificationService"
   - "Failed to send test notification"

### What to Look For:
```
[2026-XX-XX XX:XX:XX] production.ERROR: Failed to initialize Firebase messaging: ...
[2026-XX-