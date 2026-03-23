# Quick Fix Guide: Duplicate Push Subscriptions

## Immediate Action Required

### Step 1: Clean Up Existing Duplicates in Database

Run this SQL query in phpMyAdmin:

```sql
-- Delete all duplicate subscriptions, keeping only the most recent per user
DELETE ps1 FROM push_subscriptions ps1
INNER JOIN (
    SELECT user_id, MAX(created_at) as max_created_at
    FROM push_subscriptions
    GROUP BY user_id
) ps2 ON ps1.user_id = ps2.user_id
WHERE ps1.created_at < ps2.max_created_at;
```

### Step 2: Verify Cleanup

```sql
-- Check for remaining duplicates (should return 0 rows)
SELECT user_id, COUNT(*) as count
FROM push_subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;
```

## What Was Fixed

### Root Cause

Firebase was generating NEW tokens every time `getToken()` was called, and we weren't:

1. Reusing existing tokens
2. Deleting old tokens when new ones were created
3. Preventing rapid re-subscriptions

### The Fix (Already Applied)

✅ **Frontend (firebase.js)**: Now checks localStorage for existing token before calling `getToken()`  
✅ **Frontend (notifications.js)**: Deletes old token from backend when token changes  
✅ **Frontend (notifications.js)**: Added 5-second cooldown between subscription attempts  
✅ **Backend (PushSubscriptionController.php)**: Auto-deletes old user subscriptions before creating new ones  
✅ **Database**: Already has UNIQUE constraint on token column

## Testing the Fix

1. Enable notifications → Check DB (should have 1 entry)
2. Refresh page → Check DB (should still have 1 entry)
3. Click enable button 5 times rapidly → Check DB (should have 1 entry)
4. Clear browser cache → Enable again → Check DB (should have 1 entry with new token)

## Monitoring

### Check Your Subscription Status

```bash
# API endpoint (requires user auth token)
GET /api/push-subscriptions/stats
```

Response will show:

- How many subscriptions you have
- Whether you have duplicates
- List of all your subscriptions

### Clean Up Your Duplicates

```bash
# API endpoint (requires user auth token)
POST /api/push-subscriptions/cleanup
```

This will automatically keep your most recent subscription and delete the rest.

## Expected Behavior After Fix

- **First time enabling**: Creates 1 subscription
- **Refreshing page**: Reuses existing token (no new subscription)
- **Clearing cache**: Creates 1 new subscription, deletes old one
- **Multiple clicks**: Cooldown prevents duplicates
- **Multiple tabs**: Lock mechanism prevents race conditions

## Files Changed

1. `frontend/src/firebase.js` - Token reuse logic
2. `frontend/src/utils/notifications.js` - Old token cleanup + cooldown
3. `backend/app/Http/Controllers/PushSubscriptionController.php` - Auto-cleanup on new subscriptions
4. `backend/routes/api.php` - Added stats endpoint

## Need Help?

Check the detailed documentation:

- `backend/PUSH_SUBSCRIPTION_DUPLICATES_FIX.md` - Full technical explanation
- `backend/database/cleanup_duplicate_subscriptions.sql` - SQL cleanup script

## Summary

The fix ensures **each user has exactly ONE active push subscription** by:

1. Preventing unnecessary token generation
2. Cleaning up old tokens automatically
3. Multiple layers of duplicate prevention

No more duplicates! 🎉
