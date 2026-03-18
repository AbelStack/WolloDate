# ChatApp Database Schema Documentation

**Last Updated**: March 1, 2026  
**Version**: 2.0 (with Campus/Department Feature)

---

## Table of Contents

1. [Database Evolution](#database-evolution)
2. [Current Schema](#current-schema)
3. [New Schemas (Campus/Department Feature)](#new-schemas-campusdepartment-feature)
4. [How Each Component Works](#how-each-component-works)

---

## Database Evolution

### Version 1.0 (Previous)

Initially, the ChatApp database was designed with:

- Basic user authentication (no organizational structure)
- Messaging system with conversations
- Social features (friends, follows)
- Content sharing (posts, stories, comments)
- Community moderation (reports, blocks)

**Limitation**: No way to organize users by campus/department, limiting effective friend suggestions.

### Version 2.0 (Current)

Added organizational structure:

- **Campus System** - Users belong to one of 3 campuses (Main, Kombolcha, Tita)
- **Department System** - Departments nested under campuses (filtered by campus)
- **Custom Department Option** - Users can specify custom departments if "Other" is selected
- **Friend Suggestions** - Powered by campus/department matching

---

## Current Schema

### Authentication & User Management

#### Users Table

```
users
├── id (Primary Key)
├── name (string, required)
├── username (string, unique, optional)
├── email (string, unique, required)
├── email_verified_at (timestamp, nullable)
├── password (string, hashed, required)
├── avatar_url (string, nullable)
├── bio (text, nullable)
├── status_message (string, nullable)
├── is_online (boolean, default: false)
├── last_seen (timestamp, nullable)
├── student_id_image (string, nullable) - For approval verification
├── is_approved (boolean, default: false) - Admin approval required
├── is_banned (boolean, default: false) - If user is banned
├── is_private (boolean, default: true) - Private profile visibility
├── role (enum: 'user'|'admin', default: 'user')
├── approved_at (timestamp, nullable) - When admin approved user
├── approved_by (FK to users, nullable) - Which admin approved them
├── remember_token (for login persistence)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: email, [approved_by], [is_approved, is_online]


**Purpose**: Core user identity and authentication. Stores profile info, approval status, and account security.

#### Admins Table

```
admins
├── id (Primary Key)
├── name (string)
├── email (string, unique)
├── password (string, hashed)
├── remember_token (for login persistence)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: email
```

**Purpose**: Separate admin accounts for moderating users, content, and reports. Keeps admin concerns isolated from regular user accounts.

#### User Blocks Table

```
user_blocks
├── id (Primary Key)
├── user_id (FK to users) - Who is blocking
├── blocked_user_id (FK to users) - Who is blocked
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraints:
    ├─ Unique: [user_id, blocked_user_id] (one block per pair)
    └─ Index: user_id
```

**Purpose**: Track which users are blocked by whom. When User A blocks User B, User A won't see User B's content and vice versa.

---

### Messaging System

#### Conversations Table

```
conversations
├── id (Primary Key)
├── type (enum: 'private'|'group', default: 'private')
├── name (string, nullable) - Group name only
├── icon_url (string, nullable) - Group icon only
├── created_by_id (FK to users) - Creator of the conversation
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: created_by_id
```

**Purpose**: Represents a conversation thread (1:1 or group chat). Private conversations are unnamed, groups have names.

#### Conversation Members Table

```
conversation_members
├── id (Primary Key)
├── conversation_id (FK to conversations, cascade delete)
├── user_id (FK to users, cascade delete)
├── last_read_message_id (bigint, nullable)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraints:
    ├─ Unique: [conversation_id, user_id]
    └─ Index: [conversation_id, user_id]
```

**Purpose**: Junction table connect users to conversations. Tracks which user is in which conversation and their last read message (for notification counting).

#### Messages Table

```
messages
├── id (Primary Key)
├── conversation_id (FK to conversations, cascade delete)
├── user_id (FK to users, cascade delete)
├── content (text, required)
├── edited_at (timestamp, nullable) - When message was last edited
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: conversation_id, user_id, created_at


**Purpose**: Stores the actual message content. Cascade delete ensures when conversation/user is deleted, messages go too.

#### Message Statuses Table


message_statuses
├── id (Primary Key)
├── message_id (FK to messages, cascade delete)
├── user_id (FK to users, cascade delete)
├── status (enum: 'sent'|'delivered'|'seen', default: 'sent')
├── updated_at (timestamp, auto-updated)
└─ Constraints:
    ├─ Unique: [message_id, user_id] (one status per user per message)
    ├─ Index: [message_id, status]
    └─ Custom: CREATED_AT = null (migration has no created_at column)


**Purpose**: Tracks delivery status for each message to each recipient:

- **sent**: Message created, recipient hasn't received yet
- **delivered**: Recipient's app fetched the message
- **seen**: Recipient marked message as read

**Why CREATED_AT = null?** This model tracks status changes, not creation. Only `updated_at` matters. Messages might sit in 'sent' status for hours, then suddenly move to 'seen'. The important timestamp is `updated_at`.

#### Message Reactions Table


message_reactions
├── id (Primary Key)
├── message_id (FK to messages, cascade delete)
├── user_id (FK to users, cascade delete)
├── emoji (string) - The emoji reaction (👍, ❤️, etc.)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraint: Unique [message_id, user_id, emoji]


**Purpose**: Stores emoji reactions on messages. Each user can add multiple emojis to one message.

#### Message Threads Table

```
message_threads
├── id (Primary Key)
├── parent_message_id (FK to messages, cascade delete) - Original message in thread
├── message_id (FK to messages, cascade delete) - Reply in thread
```

**Purpose**: Creates reply threads/sub-conversations under a single message, like Slack threads.

#### Media Attachments Table

```
media_attachments
├── id (Primary Key)
├── message_id (FK to messages, cascade delete)
├── type (enum: 'image'|'file'|'voice')
├── file_path (string) - Path in storage
├── file_size (integer) - Bytes
├── original_filename (string) - What user uploaded as
├── mime_type (string) - Content type (image/jpeg, etc.)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: message_id
```

**Purpose**: Tracks files attached to messages. Can be images, documents, or voice messages.

#### Starred Messages Table

```
starred_messages
├── id (Primary Key)
├── message_id (FK to messages, cascade delete)
├── user_id (FK to users, cascade delete)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraints:
    ├─ Unique: [message_id, user_id]
    └─ Index: user_id
```

**Purpose**: Bookmarks important messages. User can star/unstar messages to find them later.

#### Pinned Messages Table

```
pinned_messages
├── id (Primary Key)
├── message_id (FK to messages, cascade delete)
├── conversation_id (FK to conversations, cascade delete)
├── pinned_by_id (FK to users, cascade delete)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraints:
    ├─ Unique: [message_id, conversation_id]
    └─ Index: conversation_id
```

**Purpose**: Admin/moderators can pin important messages in group chats so they appear at the top.

---

### Social Features

#### Follows Table

```
follows
├── id (Primary Key)
├── follower_id (FK to users, cascade delete) - Who is following
├── following_id (FK to users, cascade delete) - Who is being followed
├── status (enum: 'pending'|'accepted'|'rejected', default: 'pending')
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraints:
    ├─ Unique: [follower_id, following_id]
    ├─ Index: [following_id, status]
    └─ Index: [follower_id, status]
```

**Purpose**: Follow relationships (like Twitter). One-way, user can follow anyone. Status can be:

- **pending**: Waiting for acceptance (if target has private profile)
- **accepted**: Can see target's posts and stories
- **rejected**: Request declined

---

### Content & Engagement

#### Posts Table

```
posts
├── id (Primary Key)
├── user_id (FK to users, cascade delete)
├── caption (text, nullable)
├── image_url (string, nullable)
├── original_post_id (FK to posts, optional, nullable on delete) - For reposts
├── likes_count (unsigned int, default: 0) - Denormalized
├── comments_count (unsigned int, default: 0) - Denormalized
├── shares_count (unsigned int, default: 0) - Denormalized
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: [user_id, created_at]
```

**Purpose**: User posts with optional image. Can be original or a repost/share of another post. Counts are denormalized for fast retrieval.

#### Post Likes Table

```
post_likes
├── id (Primary Key)
├── user_id (FK to users, cascade delete)
├── post_id (FK to posts, cascade delete)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraints:
    ├─ Unique: [user_id, post_id]
    └─ Index: post_id
```

**Purpose**: Tracks who liked which posts. When a user likes a post, a row is created here + posts.likes_count incremented.

#### Comments Table

```
comments
├── id (Primary Key)
├── user_id (FK to users, cascade delete)
├── post_id (FK to posts, cascade delete)
├── parent_id (FK to comments, optional, cascade delete) - For nested replies
├── content (text, required)
├── likes_count (unsigned int, default: 0) - Denormalized
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: [post_id, created_at]
```

**Purpose**: Comments on posts. Can reply to other comments (parent_id creates tree structure). Supports nested threads.

#### Comment Likes Table

```
comment_likes
├── id (Primary Key)
├── user_id (FK to users, cascade delete)
├── comment_id (FK to comments, cascade delete)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraint: Unique [user_id, comment_id]
```

**Purpose**: Track likes on comments.

#### Stories Table

```
stories
├── id (Primary Key)
├── user_id (FK to users, cascade delete)
├── media_path (string) - Path to image/video in private storage
├── media_type (enum: 'image'|'video', default: 'image')
├── expires_at (timestamp) - Auto-delete after 24 hours
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: [user_id, expires_at]
└─ Index: expires_at (for cleanup jobs)
```

**Purpose**: Temporary content that disappears after 24 hours (like Snapchat/Instagram stories).

#### Story Views Table

```
story_views
├── id (Primary Key)
├── story_id (FK to stories, cascade delete)
├── viewer_id (FK to users, cascade delete)
├── viewed_at (timestamp, auto-current)
└─ Constraints:
    ├─ Unique: [story_id, viewer_id] (one view per user per story)
    └─ Index: story_id (count views per story)
```

**Purpose**: Track who viewed a story and when. Used to show "seen by" list on stories.

---

### Community Governance

#### Reports Table

```
reports
├── id (Primary Key)
├── reporter_id (FK to users, cascade delete)
├── reportable_type (string) - 'App\Models\Post', 'App\Models\Comment', etc.
├── reportable_id (unsigned bigint) - ID of the thing being reported
├── reason (enum: 'spam'|'harassment'|'inappropriate_content'|
│                 'hate_speech'|'violence'|'fake_account'|'other')
├── description (text, nullable) - Reporter's explanation
├── status (enum: 'pending'|'reviewed'|'resolved'|'dismissed', default: 'pending')
├── reviewed_by (FK to admins, optional)
├── reviewed_at (timestamp, nullable)
├── admin_notes (text, nullable)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Index: [reportable_type, reportable_id]
└─ Index: status
```

**Purpose**: Polymorphic reports (same table tracks reports on posts, comments, stories, users). Admins review and take action.

---

## New Schemas (Campus/Department Feature)

### Campuses Table (NEW)

```
campuses
├── id (Primary Key)
├── name (string, required, unique)
├── location (string, nullable) - Geographic location
├── created_at (timestamp)
├── updated_at (timestamp)
└─ No special indexes needed (only 3 departments, no filtering)
```

**Purpose**: Top-level organizational unit. Typically main campus locations (Main, East, West).

**Example Data**:

```
id | name  | location
1  | Main  | Central City
2  | East  | East District
3  | West  | West Harbor
```

**Relationships**:

- One campus has many departments (1:N)

---

### Departments Table (NEW)

```
departments
├── id (Primary Key)
├── campus_id (FK to campuses, cascade delete)
├── name (string, required)
├── created_at (timestamp)
├── updated_at (timestamp)
└─ Constraint: Unique [campus_id, name] - Can't have duplicate dept names in same campus
└─ Index: campus_id (for filtering by campus)
```

**Purpose**: Sub-organization within a campus. Different per campus.

**Example Data**:

```
id | campus_id | name
1  | 1         | Computer Science
2  | 1         | Business
3  | 1         | Engineering
4  | 1         | Other (specify)
5  | 2         | Computer Science
6  | 2         | Health Sciences
7  | 2         | Law
8  | 2         | Other (specify)
```

**Important**: Each campus has an "Other (specify)" option with `name = 'Other (specify)'`. When user selects this, campus_id + department_id point to this row, and custom text goes into `users.custom_department`.

**Relationships**:

- Many departments belong to one campus (N:1)
- One department has many users (1:N)

---

### Users Table Updates (MODIFIED)

```
users
├── [previous columns...]
├── campus_id (FK to campuses, optional, nullable) - NEW
├── department_id (FK to departments, optional, nullable) - NEW
├── custom_department (string, nullable, max 100) - NEW
└─ Index: [campus_id, department_id] (for friend suggestions)
```

**New Columns Explained**:

- **campus_id**: Which campus user belongs to. `NULL` for legacy users who joined before feature.
- **department_id**: Which department within campus. `NULL` for legacy users or users who selected "Other".
- **custom_department**: Free-text department name (max 100 chars) when user selected "Other". Example: "Research Lab", "Independent Study", etc.

**Valid Scenarios**:

1. **Regular department**:
   - campus_id = 1, department_id = 3, custom_department = NULL
   - User belongs to "Engineering" in "Main" campus

2. **Custom department**:
   - campus_id = 1, department_id = 4, custom_department = "Robotics Club"
   - User belongs to "Other (specify)" with custom text "Robotics Club"

3. **Legacy user** (no campus/dept):
   - campus_id = NULL, department_id = NULL, custom_department = NULL
   - User joined before this feature, still works but limited suggestions

---

## How Each Component Works

### 1. Messaging System - End-to-End Flow

**Scenario**: User A sends "Hello" to User B

```
Step 1: Create the message
┌─ messages table
└─ INSERT: conversation_id, user_id="A", content="Hello", created_at=now()

Step 2: Track delivery status for both users
┌─ message_statuses table
├─ INSERT: message_id=123, user_id="A", status="sent" (sender)
└─ INSERT: message_id=123, user_id="B", status="sent" (recipient)

Step 3: User B opens chat
┌─ User B's app fetches unread messages (WHERE status != 'seen')
├─ Finds the "Hello" message
└─ Backend API call: PATCH /messages/{id}/mark-seen

Step 4: Mark as seen
┌─ message_statuses table
├─ UPDATE: WHERE message_id=123 AND user_id="B"
└─ SET status="seen", updated_at=now()

Step 5: Notification count recalculates
┌─ Conversation.unread_count = COUNT(messages WHERE status != 'seen' for this user)
├─ Socket.io broadcasts "unread:refresh"
└─ User B's badge count updates from "1" to "0"
```

**Why Message Statuses?**

- **Scalability**: Instead of storing N copies of each message (one per recipient), we store 1 message + N status rows
- **Privacy**: Can't query "all messages User A sent" without seeing their content
- **Status flexibility**: Easy to track sent/delivered/seen separately

**The CREATED_AT = null Fix**:

- Original migration only had `updated_at` column
- Model had `$timestamps = true` (expects both created_at + updated_at)
- When code did `updateOrCreate()`, Eloquent tried to INSERT created_at → SQL error → silent fail
- Solution: `const CREATED_AT = null;` tells Eloquent "we don't track creation time for this model"

---

### 2. Notification Counting - How Badge Updates

**Architecture**: Global notification count = sum of all conversation unread counts

```
Database:
┌─ User opens Chat
│  └─ Fetch: SELECT unread_count FROM conversations WHERE conversation_members.user_id = auth()->id()
│     └─ unread_count = COUNT(message_statuses WHERE status != 'seen')
│     └─ Returns: [Conv1: 3 unread, Conv2: 1 unread, Conv3: 0]
│
└─ Sum locally: 3 + 1 + 0 = 4 total badge

Real-time:
┌─ Socket listener: "unread:refresh"
│  └─ When any other user SENDS you a message
│  └─ Trigger refresh of all conversations
│  └─ Recalculate badge sum
│
└─ 60-second polling fallback
   └─ If socket disconnected
   └─ Automatically refresh every 60 seconds
   └─ Pauses when tab is hidden (performance)

Optimization:
┌─ Chat is "open" (foreground)
│  └─ All incoming messages auto-marked as seen
│  └─ Badge stays at 0 while in conversation
│
└─ Chat is closed
   └─ Messages pile up as "sent"/"delivered"
   └─ Badge increments
   └─ When reopening, bulk mark-seen API call applied
```

---

### 3. Friends System - Pending + Accepted Workflow

**Two-stage relationship**:

```
State 1: Request Pending
┌─ User A sends request to User B
├─ friends table
│  ├─ INSERT: user_id="A", friend_id="B", status="pending"
│  └─ INSERT: user_id="B", friend_id="A", status="pending" (reciprocal)
└─ User B sees notification: "A wants to be your friend"

State 2: Request Accepted
┌─ User B clicks "Accept"
├─ friends table
│  ├─ UPDATE: WHERE user_id="B" AND friend_id="A"
│  │  SET status="accepted"
│  └─ UPDATE: WHERE user_id="A" AND friend_id="B"
│     SET status="accepted"
└─ Both users now see each other in friends list
```

**Why duplicate rows?**

- Easier to query "my friends": `SELECT * FROM friends WHERE user_id = auth()->id() AND status = 'accepted'`
- No need to check both directions: `(user_id = auth() OR friend_id = auth())`
- Keeps query logic simple

---

### 4. Follow System - Private/Public Profiles

**Three possible statuses**:

```
Public Profile (is_private = false):
┌─ Anyone can follow
├─ follows: follower_id="A", following_id="B", status="accepted" (auto-accept)
└─ A immediately sees B's posts and stories

Private Profile (is_private = true):
┌─ Follow request requires acceptance
├─ Step 1: A sends follow → follows: status="pending"
├─ Step 2: B reviews request
├─ Step 3: B accepts → follows: status="accepted"
└─ Now A sees B's content

Rejected:
┌─ B rejects → follows: status="rejected"
├─ A cannot see B's content
└─ A can try again later (replaces rejected row)
```

**Why separate from friends?**

- Friends = mutual reciprocal relationship (two-way)
- Follows = one-way relationship for content discovery

---

### 5. Posts & Content System - Denormalized Counts

**Why denormalized?**

```
Without denormalization:
├─ To get post likes count: SELECT COUNT(*) FROM post_likes WHERE post_id = 123
├─ Must COUNT rows every load (slow)
└─ This post has 10K likes = 10K rows to count

With denormalization:
├─ posts.likes_count = 10000 (updated real-time)
├─ instant query: SELECT likes_count FROM posts WHERE id = 123
└─ Blazingly fast

When user clicks "like":
1. INSERT INTO post_likes (user_id, post_id)
2. UPDATE posts SET likes_count = likes_count + 1 WHERE id = 123

When user clicks "unlike":
1. DELETE FROM post_likes WHERE user_id AND post_id
2. UPDATE posts SET likes_count = likes_count - 1 WHERE id = 123
```

---

### 6. Stories - TTL (Time-to-Live) System

**24-hour auto-deletion**:

```
Story Created:
├─ stories: id=999, user_id="A", media_path="/...", expires_at = NOW() + 24 hours
├─ is_visible = true (shown in feeds)
├─ Query: SELECT * FROM stories WHERE expires_at > NOW()

Story Expires (24 hours later):
├─ Cleanup job runs (daily)
├─ DELETE FROM stories WHERE expires_at <= NOW()
├─ Also triggers: DELETE FROM story_views WHERE story_id = 999 (cascade)
└─ Story vanishes from everywhere

View Tracking:
├─ User B views A's story
├─ INSERT: story_views (story_id=999, viewer_id="B", viewed_at=now())
├─ Unique constraint prevents duplicate views from same user
└─ Story owner sees "Viewed by: B, C, D" list
```

---

### 7. Reports - Polymorphic Pattern

**Same table, different reportable types**:

```
Reporting a Post:
├─ INSERT: reports
│  ├─ reporter_id = 1 (User reporting)
│  ├─ reportable_type = "App\Models\Post"
│  ├─ reportable_id = 456 (specific post ID)
│  ├─ reason = "spam"
│  └─ status = "pending"

Reporting a Comment:
├─ INSERT: reports
│  ├─ reporter_id = 1
│  ├─ reportable_type = "App\Models\Comment"
│  ├─ reportable_id = 789 (specific comment ID)
│  ├─ reason = "harassment"
│  └─ status = "pending"

Reporting a User:
├─ INSERT: reports
│  ├─ reporter_id = 1
│  ├─ reportable_type = "App\Models\User"
│  ├─ reportable_id = 5 (user ID)
│  ├─ reason = "fake_account"
│  └─ status = "pending"

Admin Workflow:
1. SELECT * FROM reports WHERE status = "pending"
2. Review details (fetch actual post/comment/user based on reportable_type + id)
3. Decide action (delete, warn, ban user, etc.)
4. UPDATE reports SET status = "reviewed", reviewed_by = admin_id, admin_notes = "..."
```

---

### 8. Campus/Department System - Friend Suggestions

**How suggestions work**:

```
User Profile:
├─ John
├─ campus_id = 1 (Main)
├─ department_id = 3 (Engineering)
└─ custom_department = NULL

Friend Suggestion Algorithm:

TIER 1 (High Priority): Same Campus + Same Department
├─ SELECT users WHERE campus_id = 1 AND department_id = 3
├─ These people are literally in John's department
├─ Score: 100 points

TIER 2 (Medium Priority): Same Campus + Different Department
├─ SELECT users WHERE campus_id = 1 AND department_id != 3
├─ Classmates but different major
├─ Score: 50 points

TIER 3 (Low Priority): Mutual Friends
├─ SELECT users WHERE EXISTS (mutual friend connection)
├─ Already knows some of John's friends
├─ Score: 25 points

TIER 4 (Very Low): Common Followers
├─ SELECT users WHERE followers_of_same_people > 0
├─ Follows similar content creators
├─ Score: 10 points

Filter Out:
├─ Users already friended (status = 'accepted')
├─ Users with pending requests
├─ Users who blocked John or vice versa
├─ John's own ID

Sort by score (descending):
└─ TIER 1 users, then TIER 2, then TIER 3, then TIER 4
└─ Return top 10 users

Return top 10:
├─ User B (Same Dept, Score: 100)
├─ User C (Same Dept, Score: 100)
├─ User D (Same Campus, Score: 50)
├─ User E (Mutual Friend, Score: 25)
├─ ... (etc, up to 10)
```

**Custom Department Matching**:

```
Scenario: Both users selected "Other (specify)"

User John:
├─ campus_id = 1
├─ department_id = 4 (Other)
└─ custom_department = "Robotics Club"

User Sarah:
├─ campus_id = 1
├─ department_id = 4 (Other)
└─ custom_department = "Robotics Club"

Logic:
├─ IF both selected "Other" in same campus:
│  └─ COMPARE custom_department (case-insensitive)
│  └─ IF match: count as TIER 1 (same dept)
│  └─ IF no match: count as TIER 2 (same campus)
├─ ELSE IF one is regular dept, one is "Other":
│  └─ No match (treat as different depts in same campus)
└─ Handles typos: "Robotics Club" vs "robotics club" = same
```

**For Legacy Users** (no campus/dept):

```
Option A: Exclude from suggestions
├─ Users without campus_id/department_id don't appear in suggestions
├─ Can't match them (no organizational data)
└─ Pro: Clean, simple. Con: Users feel left out

Option B: Show "Complete Profile" nudge
├─ Query legacy users separately
├─ Show message: "Complete your profile to see personalized suggestions"
├─ Link to profile edit page
└─ Pro: Encourages profile completion. Con: More complex

Recommendation: Option B (better UX)
```

---

## Query Examples

### Find All Unread Messages in Conversation

```sql
SELECT m.*, ms.status
FROM messages m
JOIN message_statuses ms ON m.id = ms.message_id
WHERE m.conversation_id = 1
  AND ms.user_id = 5
  AND ms.status != 'seen'
ORDER BY m.created_at DESC;
```

**How it works:**

- Join messages with their statuses
- Filter for user ID 5's view of conversation 1
- Only unread messages (status not 'seen')
- Ordered newest first

---

### Get Total Unread Count Across All Conversations

```sql
SELECT SUM(unread_per_conv) as total_unread
FROM (
  SELECT COUNT(*) as unread_per_conv
  FROM message_statuses
  WHERE user_id = 5 AND status != 'seen'
  GROUP BY message_id
) subquery;
```

**Optimization Note**: This is expensive with millions of messages. Better approach:

```sql
SELECT COUNT(DISTINCT message_id) as unread_messages
FROM message_statuses
WHERE user_id = 5 AND status != 'seen';
```

---

### Get Friend Suggestions for User (Tier 1: Same Campus + Dept)

```sql
SELECT u.*
FROM users u
WHERE u.campus_id = 1
  AND u.department_id = 3
  AND u.id != 5  -- Exclude self
  AND u.id NOT IN (
    -- Exclude already friended
    SELECT friend_id FROM friends
    WHERE user_id = 5 AND status = 'accepted'
  )
  AND u.id NOT IN (
    -- Exclude blocked users
    SELECT blocked_user_id FROM user_blocks WHERE user_id = 5
  )
  AND u.id NOT IN (
    -- Exclude users blocking us
    SELECT user_id FROM user_blocks WHERE blocked_user_id = 5
  )
ORDER BY u.created_at DESC
LIMIT 10;
```

---

### Get All Active Stories (Not Expired)

```sql
SELECT s.*, u.name, u.avatar_url,
  (SELECT COUNT(*) FROM story_views WHERE story_id = s.id) as view_count
FROM stories s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > NOW()
  AND u.is_private = false  -- Only public stories
ORDER BY s.created_at DESC;
```

---

### Find Mutual Friends

```sql
SELECT f1.friend_id
FROM friends f1
JOIN friends f2 ON f1.friend_id = f2.friend_id
WHERE f1.user_id = 5
  AND f2.user_id = 10
  AND f1.status = 'accepted'
  AND f2.status = 'accepted';
```

**Explanation**: User 5 and User 10 both have User X as a friend.

---

## Indexes Summary

**Critical indexes** for performance:

| Table            | Columns                       | Purpose                          |
| ---------------- | ----------------------------- | -------------------------------- |
| messages         | (conversation_id, created_at) | Fetch conversation history       |
| message_statuses | (user_id, status)             | Count unread messages            |
| users            | (campus_id, department_id)    | Friend suggestions filtering     |
| friends          | (user_id, status)             | Get user's friends list          |
| follows          | (following_id, status)        | Get followers of a user          |
| posts            | (user_id, created_at)         | Get user's post feed             |
| stories          | (expires_at)                  | Cleanup job, current stories     |
| reports          | (status)                      | Admin dashboard, pending reports |





## Conclusion

This database is **well-structured for 10K-100K users** with proper indexing. The campus/department addition is lightweight (3 new columns on users, 2 new tables) and leverages your existing permission/blocking system perfectly.

**Next steps:**

1. Create the three migrations (campuses, departments, user updates)
2. Run seeders to populate campus/department data
3. Update signup form to include campus/department selection
4. Build friend suggestions service using the algorithm above
5. Monitor query performance with slow query logs
