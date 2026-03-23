# Push Subscription Duplicates - Root Cause & Permanent Fix

## Problem Summary

Users were getting multiple push subscription entries in the database, causing duplicate notifications and database bloat.

## Root Cause Analysis

### Why Duplicates Were Created

1. **Firebase Token Generation Behavior**
    - Firebase's `getToken()` generates a NEW token each time it's called
    - This happens even for the same browser/device
    - Tokens can change when:
        - Service worker is updated
        - Browser cache is cleared
        - User revisits site after some time
        - Firebase internally refreshes tokens

2. **Previous Implementation Issues**
    - Frontend called `getToken()` without checking for existing tokens
    - No mechanism to delete old tokens when new ones were generated
    - No cooldown period between subscription attempts
    - Multiple components could trigger subscription simultaneously

3. **User Behavior Triggers**
    - Clicking "Enable Notifications" multiple times quickly
    - Refreshing the page after enabling notifications
    - Opening the app in multiple tabs
    - PWA auto-enable triggering at same time as manual enable

## Permanent Fix Implementation

### 1. Frontend Token Reuse (firebase.js)

```javascript
// Now checks localStorage for existing token BEFORE calling getToken()
// Only requests new token if:
// - No existing token found
// - Token verification fails
// - Service worker was updated
```

**Benefits:**

- Prevents unnecessary token generation
- Reduces API calls to Firebase
- Maintains token consistency

### 2. Old Token Cleanup (notifications.js)

```javascript
// When token changes:
// 1. Detect the change
// 2. Delete old token from backend
// 3. Save new token
```

**Benefits:**

- Automatic cleanup of stale tokens
- No manual intervention needed
- Prevents accumulation over time

### 3. Subscription Cooldown (notifications.js)

```javascript
// 5-second cooldown between subscription attempts
// Prevents rapid re-subscriptions
```

**Benefits:**

- Stops double-click issues
- Prevents race conditions
- Reduces server load

### 4. Backend Auto-Cleanup (PushSubscriptionController.php)

```php
// Before creating new subscription:
// 1. Check if token already exists → update it
// 2. If new token → delete ALL old user subscriptions first
// 3. Then create new subscription
```

**Benefits:**

- Database-level duplicate prevention
- Automatic cleanup on every new subscription
- No orphaned tokens

### 5. Database Constraint

```sql
UNIQUE KEY `push_subscriptions_token_unique` (`token`)
```

**Benefits:**

- Prevents duplicate tokens at database level
- Last line of defense
- Ensures data integrity

## How to Clean Up Existing Duplicates

### Option 1: Run SQL Cleanup Script

```bash
# In phpMyAdmin or MySQL client
mysql -u your_user -p your_database < backend/database/cleanup_duplicate_subscriptions.sql
```

### Option 2: Use API Endpoint

```bash
# Each user can clean their own duplicates
POST /api/push-subscriptions/cleanup
Authorization: Bearer {user_token}
```

### Option 3: Manual SQL Query

```sql
-- Delete all but the most recent subscription per user
DELETE ps1 FROM push_subscriptions ps1
INNER JOIN (
    SELECT user_id, MAX(created_at) as max_created_at
    FROM push_subscriptions
    GROUP BY user_id
) ps2 ON ps1.user_id = ps2.user_id
WHERE ps1.created_at < ps2.max_created_at;
```

## Verification

### Check for Duplicates

```sql
SELECT user_id, COUNT(*) as count
FROM push_subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;
```

### Expected Result

- Each user should have 0 or 1 subscription
- No duplicate tokens in the table

## Testing the Fix

1. **Enable notifications** → Check DB (should have 1 entry)
2. **Refresh page** → Check DB (should still have 1 entry, same token)
3. **Clear browser cache** → Enable again → Check DB (should have 1 entry, new token)
4. **Click enable button rapidly** → Check DB (should have 1 entry)
5. **Open in multiple tabs** → Enable in both → Check DB (should have 1 entry)

## Monitoring

### Check Subscription Health

```sql
-- Count subscriptions per user
SELECT
    COUNT(DISTINCT user_id) as total_users,
    COUNT(*) as total_subscriptions,
    COUNT(*) / COUNT(DISTINCT user_id) as avg_per_user
FROM push_subscriptions;
```

### Expected Metrics

- `avg_per_user` should be close to 1.0
- If > 1.1, investigate for new duplicate sources

## Prevention Checklist

✅ Token reuse before requesting new ones  
✅ Old token deletion when token changes  
✅ Subscription cooldown period  
✅ Backend auto-cleanup on new subscriptions  
✅ Database unique constraint  
✅ Double-click prevention in UI  
✅ Subscription lock flag

## Future Improvements

1. **Token Refresh Listener**
    - Listen for Firebase token refresh events
    - Automatically update backend when token changes

2. **Periodic Cleanup Job**
    - Cron job to remove expired/invalid tokens
    - Clean up tokens for deleted users

3. **Multi-Device Support**
    - Allow multiple devices per user (phone + desktop)
    - Track device_type to distinguish devices
    - Keep one token per device type

## Summary

The root cause was Firebase generating new tokens on every `getToken()` call, combined with no mechanism to clean up old tokens. The fix implements:

1. **Prevention**: Reuse existing tokens
2. **Detection**: Identify when tokens change
3. **Cleanup**: Delete old tokens automatically
4. **Protection**: Multiple layers of duplicate prevention

This ensures each user has exactly ONE active push subscription at any time.
