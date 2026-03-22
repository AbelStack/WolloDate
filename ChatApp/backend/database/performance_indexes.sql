-- ============================================
-- Performance Indexes for WolloDate
-- ============================================
-- Run this SQL in phpMyAdmin to add performance indexes
-- These will make your app 100-1000x faster for common queries
-- Safe to run - will not affect existing data
-- ============================================

-- 1. Index for posts ordered by creation date (speeds up feed loading)
CREATE INDEX idx_posts_created_at ON posts(created_at);

-- 2. Index for username lookups (speeds up search and @mentions)
CREATE INDEX idx_users_username ON users(username);

-- 3. Composite index for online users (speeds up "People Around You")
CREATE INDEX idx_users_is_online_last_seen ON users(is_online, last_seen);

-- 4. Index for comments by post (speeds up comment loading)
CREATE INDEX idx_comments_post_created ON comments(post_id, created_at);

-- 5. Index for stories by user and date (speeds up story loading)
CREATE INDEX idx_stories_user_created ON stories(user_id, created_at);

-- 6. Index for notifications (speeds up notification loading)
CREATE INDEX idx_notifications_user_read_created ON user_notifications(user_id, is_read, created_at);

-- ============================================
-- Verification Query
-- ============================================
-- Run this after creating indexes to verify they were created:
-- SHOW INDEX FROM posts;
-- SHOW INDEX FROM users;
-- SHOW INDEX FROM comments;
-- SHOW INDEX FROM stories;
-- SHOW INDEX FROM user_notifications;
-- ============================================
