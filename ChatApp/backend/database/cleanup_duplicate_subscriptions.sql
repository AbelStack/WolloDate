-- Cleanup script for duplicate push subscriptions
-- This removes all duplicate subscriptions, keeping only the most recent one per user

-- Step 1: Show current duplicates (for verification)
SELECT 
    user_id, 
    COUNT(*) as subscription_count,
    GROUP_CONCAT(id ORDER BY created_at DESC) as subscription_ids
FROM push_subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Step 2: Delete duplicates, keeping only the most recent subscription per user
-- This uses a subquery to identify which records to keep
DELETE ps1 FROM push_subscriptions ps1
INNER JOIN (
    SELECT user_id, MAX(created_at) as max_created_at
    FROM push_subscriptions
    GROUP BY user_id
) ps2 ON ps1.user_id = ps2.user_id
WHERE ps1.created_at < ps2.max_created_at;

-- Step 3: Verify cleanup - should show no duplicates
SELECT 
    user_id, 
    COUNT(*) as subscription_count
FROM push_subscriptions
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Step 4: Show remaining subscriptions
SELECT 
    id,
    user_id,
    SUBSTRING(token, 1, 30) as token_preview,
    device_type,
    created_at,
    updated_at
FROM push_subscriptions
ORDER BY user_id, created_at DESC;
