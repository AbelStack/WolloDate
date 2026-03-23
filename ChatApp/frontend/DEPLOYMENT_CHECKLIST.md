# ✅ Deployment Checklist - Logo Fix v3.0

## Pre-Deployment

- [x] Service worker updated to v3.0
- [x] Cache busting added (timestamp parameter)
- [x] CORS headers configured
- [x] Cache duration reduced (1 year → 1 hour)
- [x] `renotify: false` added to prevent duplicates
- [x] Backend service updated with cache busting
- [x] Frontend notifications updated
- [x] Test page created
- [x] Documentation written

## Deployment Steps

### Step 1: Commit Changes

```bash
# Check what changed
git status

# Review changes
git diff

# Stage all changes
git add .

# Commit with clear message
git commit -m "Fix notification logo v3.0 - cache busting + CORS"

# Push to production
git push origin main
```

### Step 2: Verify Deployment

#### Frontend (Vercel)

- [ ] Visit: `https://wollogram.vercel.app`
- [ ] Check deployment succeeded in Vercel dashboard
- [ ] Verify logo.png loads: `https://wollogram.vercel.app/logo.png`
- [ ] Check service worker: `https://wollogram.vercel.app/firebase-messaging-sw.js`
- [ ] Test page accessible: `https://wollogram.vercel.app/test-logo.html`

#### Backend

- [ ] Check backend deployment succeeded
- [ ] Verify FRONTEND_URL in .env: `https://wollogram.vercel.app`
- [ ] Test API endpoint responding
- [ ] Check logs for errors

### Step 3: Clear Service Worker (CRITICAL!)

**For yourself:**

1. [ ] Visit: `https://wollogram.vercel.app/test-logo.html`
2. [ ] Click "Unregister Service Worker"
3. [ ] Close browser completely
4. [ ] Reopen browser
5. [ ] Revisit app

**For users:**

- [ ] Post announcement about clearing cache
- [ ] Provide link to test page
- [ ] Instructions in app (if possible)

### Step 4: Testing

#### Test Page Verification

- [ ] Visit: `https://wollogram.vercel.app/test-logo.html`
- [ ] Logo PNG test: ✅ Loaded
- [ ] Logo JPG test: ✅ Loaded
- [ ] Cache busting test: ✅ Loaded
- [ ] CORS test: ✅ Properly configured
- [ ] Service worker: Shows v3.0
- [ ] Test notification: Logo on both sides

#### Real Notification Test

- [ ] Send message from Account A to Account B
- [ ] Check notification on Account B
- [ ] Logo shows on left (icon) ✅
- [ ] Logo shows on right (badge) ✅
- [ ] No duplicate notifications ✅

#### Browser Testing

- [ ] Chrome Desktop ✅
- [ ] Firefox Desktop ✅
- [ ] Edge Desktop ✅
- [ ] Chrome Mobile ✅
- [ ] Firefox Mobile ✅
- [ ] Safari Mobile (limited support expected)

#### Console Verification

- [ ] Open browser console
- [ ] Look for: `[SW v3.0] Received background message`
- [ ] Look for: `[SW v3.0] Using icon URL: ...?v=...`
- [ ] No errors in console

### Step 5: Database Cleanup (Optional)

```sql
-- Check for invalid subscriptions
SELECT * FROM push_subscriptions WHERE user_id = 0;

-- Delete invalid subscriptions
DELETE FROM push_subscriptions WHERE user_id = 0;

-- Check for duplicates (should return 0)
SELECT token, COUNT(*) as count
FROM push_subscriptions
GROUP BY token
HAVING count > 1;
```

- [ ] Invalid subscriptions removed
- [ ] No duplicate tokens found

### Step 6: Monitor

#### First Hour

- [ ] Check error logs
- [ ] Monitor notification delivery
- [ ] Check user reports
- [ ] Test on different devices

#### First Day

- [ ] Review analytics
- [ ] Check notification success rate
- [ ] Monitor for duplicate reports
- [ ] Verify logo showing consistently

#### First Week

- [ ] Collect user feedback
- [ ] Check for edge cases
- [ ] Monitor different browsers
- [ ] Verify mobile performance

## Rollback Plan (If Needed)

If issues occur:

1. **Revert service worker:**

   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Clear service worker again:**
   - Users must unregister and reload

3. **Check logs:**
   - Backend logs for errors
   - Browser console for issues
   - Firebase console for delivery

## Success Metrics

- [ ] Logo shows on left (icon) in 100% of notifications
- [ ] Logo shows on right (badge) in 100% of notifications
- [ ] No duplicate notifications reported
- [ ] Works across all major browsers
- [ ] Mobile notifications working
- [ ] No increase in error rate

## Known Limitations

- ⚠️ Safari (iOS/Mac): Limited notification support, badge may not show
- ⚠️ Old browsers: May not support all features
- ⚠️ Users must unregister old service worker manually

## Post-Deployment Communication

### User Announcement Template

```
🔔 Notification Update!

We've fixed the notification logo issue. To see the fix:

1. Visit: https://wollogram.vercel.app/test-logo.html
2. Click "Unregister Service Worker"
3. Close and reopen your browser
4. Test notifications!

The logo should now appear on both sides of notifications. 🎉
```

### Support Response Template

```
Hi! We've deployed a fix for the notification logo.

Please follow these steps:
1. Visit https://wollogram.vercel.app/test-logo.html
2. Click "Unregister Service Worker" button
3. Close your browser completely
4. Reopen and test

If still not working:
- Try incognito mode
- Clear browser cache
- Check the test page for errors

Let us know if you need help!
```

## Files Changed Summary

| File                                               | Purpose                | Status     |
| -------------------------------------------------- | ---------------------- | ---------- |
| `frontend/public/firebase-messaging-sw.js`         | Service worker v3.0    | ✅ Updated |
| `backend/app/Services/PushNotificationService.php` | Backend notifications  | ✅ Updated |
| `frontend/src/utils/notifications.js`              | Frontend notifications | ✅ Updated |
| `frontend/vercel.json`                             | CORS + caching         | ✅ Updated |
| `frontend/test-logo.html`                          | Test page              | ✅ Created |
| `frontend/NOTIFICATION_LOGO_FIX.md`                | Documentation          | ✅ Created |
| `LOGO_FIX_SUMMARY.md`                              | Summary                | ✅ Created |
| `QUICK_FIX_GUIDE.md`                               | Quick guide            | ✅ Created |
| `DEPLOYMENT_CHECKLIST.md`                          | This file              | ✅ Created |

## Emergency Contacts

- Frontend: Vercel Dashboard
- Backend: Server logs
- Firebase: Firebase Console
- Database: Direct SQL access

## Notes

- Service worker version: v3.0
- Cache duration: 1 hour (was 1 year)
- Logo file: logo.png (192x192 PNG)
- CORS: Enabled for all origins
- Cache busting: Timestamp parameter

---

**Deployment Date**: ******\_******
**Deployed By**: ******\_******
**Verified By**: ******\_******
**Status**: ******\_******

## Sign-Off

- [ ] All tests passed
- [ ] Documentation complete
- [ ] Users notified
- [ ] Monitoring in place
- [ ] Ready for production ✅
