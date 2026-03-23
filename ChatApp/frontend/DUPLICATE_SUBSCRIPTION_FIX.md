# Duplicate Subscription Fix ✅

## Problem:

Users were getting 2 subscriptions in the database with different FCM tokens.

## Root Cause:

The `subscribeToPushNotifications()` function was being called **twice** in quick succession, causing Firebase to generate 2 different tokens for the same user/device.

This happened because:

1. User clicked "Enable" button twice quickly
2. React component mounted twice (React 18 Strict Mode)
3. Multiple components calling subscription function
4. No lock mechanism to prevent concurrent subscriptions

## Solution Implemented:

### 1. ✅ Subscription Lock

Added a `subscriptionInProgress` flag to prevent multiple simultaneous subscription attempts:

```javascript
let subscriptionInProgress = false;

export const subscribeToPushNotifications = async () => {
  if (subscriptionInProgress) {
    console.log("Subscription already in progress, skipping...");
    return null;
  }

  try {
    subscriptionInProgress = true;
    // ... subscription logic
  } finally {
    subscriptionInProgress = false;
  }
};
```

### 2. ✅ Token Storage

Store the FCM token in localStorage to track active subscriptions:

```javascript
localStorage.setItem("fcmToken", token);
```

### 3. ✅ Better Subscription Check

Enhanced `isNotificationEnabled()` to check for stored token:

```javascript
export const isNotificationEnabled = () => {
  const hasToken = Boolean(localStorage.getItem("fcmToken"));
  const isGranted = Notification.permission === "granted";
  const isMarkedEnabled =
    localStorage.getItem("notificationEnabled") === "true";

  return hasToken && isGranted && isMarkedEnabled;
};
```

### 4. ✅ Cleanup Endpoint

Added `/api/push-subscriptions/cleanup` endpoint to remove duplicate subscriptions:

**Usage:**

```bash
POST /api/push-subscriptions/cleanup
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "Duplicate subscriptions cleaned up",
  "deleted_count": 1,
  "remaining_count": 1
}
```

### 5. ✅ Improved Unsubscribe

Now sends the specific token when unsubscribing:

```javascript
const token = localStorage.getItem("fcmToken");
await api.delete("/push-subscriptions", { data: { token } });
localStorage.removeItem("fcmToken");
```

## How to Clean Up Existing Duplicates:

### Option 1: User Self-Cleanup (Automatic)

Users can call the cleanup endpoint from their settings:

```javascript
import api from "../api";

const cleanupDuplicates = async () => {
  const response = await api.post("/push-subscriptions/cleanup");
  console.log(response.data.message);
};
```

### Option 2: Database Manual Cleanup (Admin)

Run this SQL to keep only the most recent subscription per user:

```sql
DELETE ps1 FROM push_subscriptions ps1
INNER JOIN push_subscriptions ps2
WHERE ps1.user_id = ps2.user_id
  AND ps1.created_at < ps2.created_at;
```

### Option 3: Laravel Artisan Command (Recommended)

Create a cleanup command:

```bash
php artisan make:command CleanupDuplicateSubscriptions
```

Then run:

```bash
php artisan subscriptions:cleanup
```

## Prevention:

The fixes ensure that:

1. ✅ Only one subscription attempt can run at a time
2. ✅ Token is stored locally to prevent re-subscription
3. ✅ Users can clean up their own duplicates
4. ✅ Unsubscribe removes specific token, not all subscriptions

## Testing:

To verify the fix works:

1. **Test rapid clicks:**
   - Click "Enable Notifications" button multiple times quickly
   - Check database - should only have 1 subscription

2. **Test component remount:**
   - Enable notifications
   - Refresh page
   - Check database - should still have only 1 subscription

3. **Test cleanup:**
   - If user has duplicates, call `/api/push-subscriptions/cleanup`
   - Verify only 1 subscription remains

## Files Modified:

1. `frontend/src/utils/notifications.js`
   - Added subscription lock
   - Added token storage
   - Improved subscription check
   - Enhanced unsubscribe

2. `backend/app/Http/Controllers/PushSubscriptionController.php`
   - Added cleanup() method

3. `backend/routes/api.php`
   - Added cleanup route

---

**Status**: ✅ Fixed - Users will no longer create duplicate subscriptions
