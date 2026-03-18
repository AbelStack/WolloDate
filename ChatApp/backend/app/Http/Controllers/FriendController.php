<?php

namespace App\Http\Controllers;

use App\Models\Friend;
use App\Models\Follow;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Http\Request;

class FriendController extends Controller
{
    /**
     * Get friend suggestions with varied criteria
     * GET /api/friends/suggestions
     * Returns: same department users, mutual friends, and 2 random
     */
    public function suggestions(Request $request)
    {
        $user = auth()->user();
        $limit = min((int) $request->get('limit', 8), 20);

        // Get user's accepted friend IDs (both directions)
        $userFriendIds = Friend::where(function ($q) use ($user) {
                $q->where('user_id', $user->id)->orWhere('friend_id', $user->id);
            })
            ->where('status', 'accepted')
            ->get()
            ->flatMap(fn ($f) => [$f->user_id, $f->friend_id])
            ->unique()
            ->reject(fn ($id) => $id === $user->id)
            ->values();

        // All friend-related IDs to exclude (accepted + pending)
        $allFriendRelated = Friend::where(function ($q) use ($user) {
                $q->where('user_id', $user->id)->orWhere('friend_id', $user->id);
            })
            ->get()
            ->flatMap(fn ($f) => [$f->user_id, $f->friend_id])
            ->unique()
            ->values();

        // Exclude users already connected through follows (accepted or pending)
        $followRelatedIds = Follow::where(function ($q) use ($user) {
                $q->where('follower_id', $user->id)->orWhere('following_id', $user->id);
            })
            ->whereIn('status', ['accepted', 'pending'])
            ->get()
            ->flatMap(fn ($f) => [$f->follower_id, $f->following_id])
            ->unique()
            ->values();

        $blockedIds = UserBlock::where('user_id', $user->id)
            ->pluck('blocked_user_id')
            ->merge(UserBlock::where('blocked_user_id', $user->id)->pluck('user_id'));

        $excludeIds = $allFriendRelated
            ->merge($followRelatedIds)
            ->merge($blockedIds)
            ->push($user->id)
            ->unique()
            ->values()
            ->all();

        // Base: approved users, not excluded
        $base = User::where('is_approved', true)->whereNotIn('id', $excludeIds);

        // 1. Same department users
        $sameDept = collect();
        if ($user->department_id) {
            $sameDept = (clone $base)
                ->where('department_id', $user->department_id)
                ->orderByDesc('is_online')
                ->orderByDesc('last_seen')
                ->limit(ceil($limit / 2))
                ->get(['id', 'name', 'username', 'avatar_url', 'campus_id', 'department_id', 'is_online'])
                ->each(fn ($u) => $u->forceFill(['suggestion_type' => 'department', 'same_department' => true, 'mutual_friends' => 0]));
        }

        // 2. Users with mutual friends
        $mutual = collect();
        if ($userFriendIds->isNotEmpty()) {
            $friendIdList = $userFriendIds->implode(',');
            $mutual = (clone $base)
                ->whereNotIn('id', $sameDept->pluck('id')->all())
                ->selectRaw("users.*, (
                    (SELECT COUNT(*) FROM friends WHERE friend_id = users.id AND user_id IN ({$friendIdList}) AND status = 'accepted') +
                    (SELECT COUNT(*) FROM friends WHERE user_id = users.id AND friend_id IN ({$friendIdList}) AND status = 'accepted')
                ) as mutual_count")
                ->havingRaw('mutual_count > 0')
                ->orderByDesc('mutual_count')
                ->limit(ceil($limit / 2))
                ->get()
                ->each(fn ($u) => $u->forceFill(['suggestion_type' => 'mutual', 'same_department' => $u->department_id === $user->department_id, 'mutual_friends' => (int) $u->mutual_count]));
        }

        // 3. Random users (fill remaining slots)
        $pickedIds = $sameDept->pluck('id')->merge($mutual->pluck('id'))->all();
        $remaining = $limit - count($pickedIds);
        $random = collect();
        if ($remaining > 0) {
            $query = (clone $base)->whereNotIn('id', $pickedIds);
            if ($user->campus_id) {
                $query->where('campus_id', $user->campus_id);
            }
            $random = $query->inRandomOrder()
                ->limit($remaining)
                ->get(['id', 'name', 'username', 'avatar_url', 'campus_id', 'department_id', 'is_online'])
                ->each(fn ($u) => $u->forceFill(['suggestion_type' => 'random', 'same_department' => $u->department_id === $user->department_id, 'mutual_friends' => 0]));
        }

        $suggestions = $sameDept->merge($mutual)->merge($random)->take($limit);

        if ($suggestions->isNotEmpty()) {
            $ids = $suggestions->pluck('id')->all();
            $departments = \App\Models\Department::whereIn('id', $suggestions->pluck('department_id')->filter()->unique()->all())->pluck('name', 'id');
            $suggestions->each(function ($s) use ($departments) {
                $s->department_name = $departments[$s->department_id] ?? null;
                unset($s->mutual_count);
            });
        }

        return response()->json($suggestions->values());
    }

    /**
     * Get friend list
     * GET /api/friends
     */
    public function getList(Request $request)
    {
        try {
            $user = auth()->user();

            $friends = $user->friends()->get();

            return response()->json([
                'count' => $friends->count(),
                'friends' => $friends,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get friends',
            ], 500);
        }
    }

    /**
     * Send friend request
     * POST /api/friends/request
     * Body: { friend_id }
     */
    public function sendRequest(Request $request)
    {
        try {
            $validated = $request->validate([
                'friend_id' => 'required|integer|exists:users,id',
            ]);

            $user = auth()->user();
            $friendId = $validated['friend_id'];

            if ($user->id == $friendId) {
                return response()->json([
                    'message' => 'Cannot send friend request to yourself',
                ], 400);
            }

            // Check if request already exists
            $exists = Friend::where('user_id', $user->id)
                ->where('friend_id', $friendId)
                ->exists();

            if ($exists) {
                return response()->json([
                    'message' => 'Friend request already exists',
                ], 400);
            }

            // Create friend request
            Friend::create([
                'user_id' => $user->id,
                'friend_id' => $friendId,
                'status' => 'pending',
            ]);

            return response()->json([
                'message' => 'Friend request sent',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to send request',
            ], 500);
        }
    }

    /**
     * Get pending friend requests
     * GET /api/friends/requests
     */
    public function getPendingRequests(Request $request)
    {
        try {
            $user = auth()->user();

            $requests = Friend::where('friend_id', $user->id)
                ->where('status', 'pending')
                ->with('user:id,name,email,avatar_url')
                ->get();

            return response()->json([
                'count' => $requests->count(),
                'requests' => $requests,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get requests',
            ], 500);
        }
    }

    /**
     * Accept/deny friend request
     * PUT /api/friends/requests/{id}
     * Body: { status: 'accepted'|'denied' }
     */
    public function respondToRequest(Request $request, $id)
    {
        try {
            $friendRequest = Friend::find($id);
            $user = auth()->user();

            if (!$friendRequest) {
                return response()->json([
                    'message' => 'Friend request not found',
                ], 404);
            }

            // Check if user is the recipient
            if ($friendRequest->friend_id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized - this request is not for you',
                ], 403);
            }

            $validated = $request->validate([
                'status' => 'required|in:accepted,denied',
            ]);

            if ($validated['status'] === 'denied') {
                // Delete the request
                $friendRequest->delete();
                return response()->json([
                    'message' => 'Friend request denied',
                ], 200);
            }

            // Accept the request
            $friendRequest->update(['status' => 'accepted']);

            // Create reverse friendship (bidirectional)
            Friend::updateOrCreate(
                [
                    'user_id' => $friendRequest->friend_id,
                    'friend_id' => $friendRequest->user_id,
                ],
                [
                    'status' => 'accepted',
                ]
            );

            return response()->json([
                'message' => 'Friend request accepted',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to respond to request',
            ], 500);
        }
    }

    /**
     * Remove friend
     * DELETE /api/friends/{id}
     */
    public function removeFriend($id)
    {
        try {
            $user = auth()->user();

            // Find and delete both directions of the friendship
            Friend::where(function ($query) use ($user, $id) {
                $query->where('user_id', $user->id)->where('friend_id', $id)
                    ->orWhere('user_id', $id)->where('friend_id', $user->id);
            })->delete();

            return response()->json([
                'message' => 'Friend removed',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to remove friend',
            ], 500);
        }
    }
}
