<?php

namespace App\Http\Controllers;

use App\Models\Follow;
use App\Models\UserNotification;
use App\Models\User;
use App\Services\PushNotificationService;
use Illuminate\Http\Request;

class FollowController extends Controller
{
    protected $pushNotificationService;

    public function __construct(PushNotificationService $pushNotificationService)
    {
        $this->pushNotificationService = $pushNotificationService;
    }
    /**
     * Send a follow request
     * POST /api/follows/{userId}
     */
    public function follow(Request $request, $userId)
    {
        $user = $request->user();
        $targetUser = User::findOrFail($userId);

        if ($user->id === $targetUser->id) {
            return response()->json(['message' => 'Cannot follow yourself'], 400);
        }

        // Check if already following or has pending request
        $existingFollow = Follow::where('follower_id', $user->id)
            ->where('following_id', $targetUser->id)
            ->first();

        if ($existingFollow) {
            if ($existingFollow->status === 'accepted') {
                return response()->json(['message' => 'Already following this user'], 400);
            }
            if ($existingFollow->status === 'pending') {
                return response()->json(['message' => 'Follow request already pending'], 400);
            }
            // If rejected, allow re-request
            $existingFollow->update(['status' => 'pending']);
            return response()->json(['message' => 'Follow request sent', 'status' => 'pending']);
        }

        // Auto-accept if target user is public
        $status = $targetUser->is_private ? 'pending' : 'accepted';

        Follow::create([
            'follower_id' => $user->id,
            'following_id' => $targetUser->id,
            'status' => $status,
        ]);

        // Send push notification if accepted immediately
        if ($status === 'accepted') {
            $this->pushNotificationService->sendFollowNotification($targetUser, $user);
        }

        return response()->json([
            'message' => $status === 'accepted' ? 'Now following' : 'Follow request sent',
            'status' => $status,
        ], 201);
    }

    /**
     * Unfollow a user
     * DELETE /api/follows/{userId}
     */
    public function unfollow(Request $request, $userId)
    {
        $user = $request->user();

        $follow = Follow::where('follower_id', $user->id)
            ->where('following_id', $userId)
            ->first();

        if (!$follow) {
            return response()->json(['message' => 'Not following this user'], 400);
        }

        $follow->delete();

        return response()->json(['message' => 'Unfollowed successfully']);
    }

    /**
     * Get pending follow requests for current user
     * GET /api/follows/requests
     */
    public function getRequests(Request $request)
    {
        $requests = $request->user()
            ->pendingFollowRequests()
            ->with('follower:id,name,username,avatar_url,is_approved')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($requests);
    }

    /**
     * Accept or reject a follow request
     * PUT /api/follows/requests/{followId}
     * Body: { action: 'accept' | 'reject' }
     */
    public function respondToRequest(Request $request, $followId)
    {
        $validated = $request->validate([
            'action' => 'required|in:accept,reject',
        ]);

        $follow = Follow::where('id', $followId)
            ->where('following_id', $request->user()->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $follow->update([
            'status' => $validated['action'] === 'accept' ? 'accepted' : 'rejected',
        ]);

        // Send push notification if accepted
        if ($validated['action'] === 'accept') {
            $this->pushNotificationService->sendFollowNotification(
                $follow->follower,
                $request->user()
            );
        }

        return response()->json([
            'message' => $validated['action'] === 'accept' 
                ? 'Follow request accepted' 
                : 'Follow request rejected',
        ]);
    }

    /**
     * Remove a follower
     * DELETE /api/follows/followers/{userId}
     */
    public function removeFollower(Request $request, $userId)
    {
        $follow = Follow::where('follower_id', $userId)
            ->where('following_id', $request->user()->id)
            ->first();

        if (!$follow) {
            return response()->json(['message' => 'User is not following you'], 400);
        }

        $follow->delete();

        return response()->json(['message' => 'Follower removed']);
    }

    /**
     * Get followers list
     * GET /api/users/{userId}/followers
     */
    public function getFollowers(Request $request, $userId)
    {
        $user = User::findOrFail($userId);
        $currentUser = $request->user();

        // Check privacy
        if (!$currentUser->canViewProfile($user)) {
            return response()->json(['message' => 'This account is private'], 403);
        }

        $followers = $user->followers()->select('users.id', 'name', 'username', 'avatar_url', 'is_approved')->get();

        return response()->json($followers);
    }

    /**
     * Get following list
     * GET /api/users/{userId}/following
     */
    public function getFollowing(Request $request, $userId)
    {
        $user = User::findOrFail($userId);
        $currentUser = $request->user();

        // Check privacy
        if (!$currentUser->canViewProfile($user)) {
            return response()->json(['message' => 'This account is private'], 403);
        }

        $following = $user->following()->select('users.id', 'name', 'username', 'avatar_url', 'is_approved')->get();

        return response()->json($following);
    }

    /**
     * Get follow activity / notifications for current user
     * Returns all recent follow activity (pending + accepted) with follow-back status
     * GET /api/follows/activity
     */
    public function getActivity(Request $request)
    {
        $currentUser = $request->user();

        // Get all follows targeting the current user (both pending and accepted), newest first
        $activity = Follow::where('following_id', $currentUser->id)
            ->whereIn('status', ['pending', 'accepted'])
            ->with('follower:id,name,username,avatar_url,is_approved')
            ->orderBy('updated_at', 'desc')
            ->take(50)
            ->get();

        // For each follower, check if current user follows them back
        $followerIds = $activity->pluck('follower_id')->toArray();
        $followingBack = Follow::where('follower_id', $currentUser->id)
            ->whereIn('following_id', $followerIds)
            ->where('status', 'accepted')
            ->pluck('following_id')
            ->toArray();

        $followItems = $activity->map(function ($follow) use ($followingBack) {
            return [
                'id' => $follow->id,
                'type' => 'follow',
                'follower' => $follow->follower,
                'status' => $follow->status,
                'is_following_back' => in_array($follow->follower_id, $followingBack),
                'created_at' => $follow->created_at,
                'updated_at' => $follow->updated_at,
            ];
        });

        $mentionItems = UserNotification::where('recipient_id', $currentUser->id)
            ->whereIn('type', ['mention_post', 'mention_story'])
            ->with('actor:id,name,username,avatar_url,is_approved')
            ->orderBy('created_at', 'desc')
            ->take(50)
            ->get()
            ->map(function ($notification) {
                $isStoryMention = $notification->type === 'mention_story';

                return [
                    'id' => 'notification-' . $notification->id,
                    'type' => 'mention',
                    'status' => 'mention',
                    'notification_type' => $notification->type,
                    'mention_type' => $isStoryMention ? 'story' : 'post',
                    'content_type' => $isStoryMention ? 'story' : 'post',
                    'is_read' => (bool) $notification->is_read,
                    'message' => $notification->message,
                    'actor' => $notification->actor,
                    'follower' => $notification->actor,
                    'post_id' => $notification->post_id,
                    'story_id' => $notification->story_id,
                    'created_at' => $notification->created_at,
                    'updated_at' => $notification->updated_at,
                ];
            });

        // Get comment notifications
        $commentItems = UserNotification::where('recipient_id', $currentUser->id)
            ->where('type', 'comment')
            ->with([
                'actor:id,name,username,avatar_url,is_approved',
                'post:id,caption,image_url,media_urls'
            ])
            ->orderBy('created_at', 'desc')
            ->take(50)
            ->get()
            ->map(function ($notification) {
                return [
                    'id' => 'comment-' . $notification->id,
                    'type' => 'comment',
                    'status' => 'comment',
                    'notification_type' => $notification->type,
                    'is_read' => (bool) $notification->is_read,
                    'message' => $notification->message,
                    'actor' => $notification->actor,
                    'follower' => $notification->actor,
                    'post_id' => $notification->post_id,
                    'post' => $notification->post,
                    'created_at' => $notification->created_at,
                    'updated_at' => $notification->updated_at,
                ];
            });

        $result = $followItems
            ->concat($mentionItems)
            ->concat($commentItems)
            ->sortByDesc('updated_at')
            ->values();

        // Count of pending requests (for badge)
        $pendingCount = $activity->where('status', 'pending')->count();
        $unreadActivityCount = UserNotification::where('recipient_id', $currentUser->id)
            ->whereIn('type', ['mention_post', 'mention_story', 'comment'])
            ->where('is_read', false)
            ->count();

        return response()->json([
            'activity' => $result,
            'pending_count' => $pendingCount,
            'mention_unread_count' => $unreadActivityCount,
            'activity_unread_count' => $unreadActivityCount,
            'badge_count' => $pendingCount + $unreadActivityCount,
        ]);
    }
}
