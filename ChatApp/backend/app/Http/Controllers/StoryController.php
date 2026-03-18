<?php

namespace App\Http\Controllers;

use App\Models\Follow;
use App\Models\Story;
use App\Models\StoryLike;
use App\Models\UserNotification;
use App\Models\StoryView;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StoryController extends Controller
{
    /**
     * Upload a new story
     * POST /api/stories
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'media' => 'nullable|file|max:51200', // 50MB max
            'media_files' => 'nullable|array|max:20',
            'media_files.*' => 'file|max:51200',
            'caption' => 'nullable|string|max:500',
        ]);

        $files = [];
        if ($request->hasFile('media_files')) {
            $files = array_merge($files, $request->file('media_files'));
        }
        if ($request->hasFile('media')) {
            $files[] = $request->file('media');
        }

        if (count($files) === 0) {
            return response()->json(['message' => 'Please select at least one image or video'], 422);
        }

        if (count($files) > 20) {
            return response()->json(['message' => 'You can upload up to 20 stories at once'], 422);
        }

        $createdStories = [];
        $allMentionedUserIds = collect();

        foreach ($files as $file) {
            $mediaType = $this->resolveMediaType($file);
            if (!$mediaType) {
                return response()->json(['message' => 'Only image files and supported video formats are allowed'], 422);
            }

            // Store in private storage (not publicly accessible)
            $path = $file->store('stories', 'local');

            $story = Story::create([
                'user_id' => $request->user()->id,
                'media_path' => $path,
                'media_type' => $mediaType,
                'caption' => $validated['caption'] ?? null,
                'expires_at' => now()->addHours(24),
            ]);

            $mentionedUserIds = $this->createStoryMentionNotifications(
                $request->user(),
                $story,
                $validated['caption'] ?? null
            );

            $createdStories[] = $story;
            $allMentionedUserIds = $allMentionedUserIds->merge($mentionedUserIds);
        }

        return response()->json([
            'message' => count($createdStories) === 1 ? 'Story uploaded successfully' : 'Stories uploaded successfully',
            'story' => $this->formatStory($createdStories[0], $request->user()),
            'stories' => collect($createdStories)->map(fn (Story $story) => $this->formatStory($story, $request->user()))->values(),
            'mentioned_user_ids' => $allMentionedUserIds->unique()->values(),
        ], 201);
    }

    private function resolveMediaType($file): ?string
    {
        $mimeType = strtolower((string) $file->getMimeType());
        $extension = strtolower((string) $file->getClientOriginalExtension());

        $videoMimeTypes = [
            'video/mp4',
            'video/quicktime',
            'video/webm',
            'video/x-matroska',
            'video/3gpp',
            'video/3gpp2',
            'video/x-msvideo',
            'video/x-ms-wmv',
            'video/mpeg',
        ];
        $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif'];
        $videoExtensions = ['mp4', 'mov', 'webm', 'mkv', '3gp', 'avi', 'wmv', 'mpeg'];

        if (str_starts_with($mimeType, 'image/') || in_array($extension, $imageExtensions, true)) {
            return 'image';
        }

        if (
            str_starts_with($mimeType, 'video/')
            || in_array($mimeType, $videoMimeTypes, true)
            || in_array($extension, $videoExtensions, true)
        ) {
            return 'video';
        }

        return null;
    }

    /**
     * Get all active stories from followed users (grouped by user)
     * GET /api/stories
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // Get IDs of users the current user follows (accepted only)
        $followingIds = $user->following()->pluck('users.id')->toArray();
        
        // Include own stories
        $followingIds[] = $user->id;

        // Get users who have active stories
        $usersWithStories = User::whereIn('id', $followingIds)
            ->whereHas('activeStories')
            ->with(['activeStories' => function ($query) {
                $query->with([
                    'repostFromUser:id,name,username,avatar_url,is_approved',
                ])->orderBy('created_at', 'asc');
            }])
            ->get();

        // Format the response grouped by user
        $storiesByUser = $usersWithStories->map(function ($storyUser) use ($user) {
            $stories = $storyUser->activeStories->map(function ($story) use ($user) {
                return $this->formatStory($story, $user);
            });

            // Check if current user has viewed all stories from this user
            $hasUnviewed = $stories->contains(function ($story) {
                return !$story['is_viewed'];
            });

            return [
                'user' => [
                    'id' => $storyUser->id,
                    'name' => $storyUser->name,
                    'username' => $storyUser->username,
                    'avatar_url' => $storyUser->avatar_url,
                    'is_approved' => $storyUser->is_approved,
                ],
                'stories' => $stories,
                'has_unviewed' => $hasUnviewed,
                'latest_story_at' => $storyUser->activeStories->max('created_at'),
            ];
        });

        // Sort: unviewed first, then by latest story time
        $sorted = $storiesByUser->sortByDesc(function ($item) {
            return [$item['has_unviewed'] ? 1 : 0, $item['latest_story_at']];
        })->values();

        // Move current user's stories to the beginning if they have any
        $currentUserIndex = $sorted->search(function ($item) use ($user) {
            return $item['user']['id'] === $user->id;
        });

        if ($currentUserIndex !== false) {
            $currentUserStories = $sorted->pull($currentUserIndex);
            $sorted = collect([$currentUserStories])->merge($sorted);
        }

        return response()->json($sorted);
    }

    /**
     * Get stories for a specific user
     * GET /api/users/{userId}/stories
     */
    public function userStories(Request $request, $userId)
    {
        $targetUser = User::findOrFail($userId);
        $currentUser = $request->user();

        // Check if viewer can view this user's stories
        if (!$this->canViewStories($currentUser, $targetUser)) {
            return response()->json(['message' => 'You cannot view this user\'s stories'], 403);
        }

        $stories = $targetUser->activeStories()
            ->with([
                'repostFromUser:id,name,username,avatar_url,is_approved',
            ])
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function ($story) use ($currentUser) {
                return $this->formatStory($story, $currentUser);
            });

        return response()->json([
            'user' => [
                'id' => $targetUser->id,
                'name' => $targetUser->name,
                'username' => $targetUser->username,
                'avatar_url' => $targetUser->avatar_url,
                'is_approved' => $targetUser->is_approved,
            ],
            'stories' => $stories,
        ]);
    }

    /**
     * Get a single active story for deep-linking.
     * GET /api/stories/{storyId}
     */
    public function show(Request $request, $storyId)
    {
        $story = Story::with([
            'user:id,name,username,avatar_url,is_approved',
            'repostFromUser:id,name,username,avatar_url,is_approved',
        ])->active()->findOrFail($storyId);

        $currentUser = $request->user();
        if (!$this->canViewStories($currentUser, $story->user)) {
            return response()->json(['message' => 'You cannot view this story'], 403);
        }

        return response()->json([
            'story' => $this->formatStory($story, $currentUser),
            'user' => $story->user,
        ]);
    }

    /**
     * View a story (mark as viewed)
     * POST /api/stories/{storyId}/view
     */
    public function view(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        $currentUser = $request->user();

        // Check if viewer can view this story
        if (!$this->canViewStories($currentUser, $story->user)) {
            return response()->json(['message' => 'You cannot view this story'], 403);
        }

        // Don't track view for own stories
        if ($story->user_id !== $currentUser->id) {
            // Record view (upsert to avoid duplicates)
            StoryView::firstOrCreate([
                'story_id' => $story->id,
                'viewer_id' => $currentUser->id,
            ]);
        }

        return response()->json(['message' => 'Story viewed']);
    }

    /**
     * Get viewers for own story
     * GET /api/stories/{storyId}/viewers
     */
    public function viewers(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        $currentUser = $request->user();

        // Only owner can see viewers
        if ($story->user_id !== $currentUser->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $viewers = $story->views()
            ->with('viewer:id,name,username,avatar_url,is_approved')
            ->orderBy('viewed_at', 'desc')
            ->get();

        // Get IDs of users who liked this story
        $likedUserIds = $story->likes()->pluck('user_id')->toArray();

        $formatted = $viewers->map(function ($view) use ($likedUserIds) {
            return [
                'user' => $view->viewer,
                'viewed_at' => $view->viewed_at,
                'has_liked' => in_array($view->viewer_id, $likedUserIds),
            ];
        });

        // Sort: likers first, then non-likers (each sub-group by viewed_at desc)
        $sorted = $formatted->sortByDesc(function ($item) {
            return [$item['has_liked'] ? 1 : 0, $item['viewed_at']];
        })->values();

        return response()->json([
            'viewers' => $sorted,
            'count' => $sorted->count(),
            'like_count' => count($likedUserIds),
        ]);
    }

    /**
     * Like a story
     * POST /api/stories/{storyId}/like
     */
    public function like(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        $currentUser = $request->user();

        if (!$this->canViewStories($currentUser, $story->user)) {
            return response()->json(['message' => 'You cannot interact with this story'], 403);
        }

        StoryLike::firstOrCreate([
            'story_id' => $story->id,
            'user_id' => $currentUser->id,
        ]);

        return response()->json([
            'message' => 'Story liked',
            'like_count' => $story->like_count,
        ]);
    }

    /**
     * Unlike a story
     * DELETE /api/stories/{storyId}/like
     */
    public function unlike(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        $currentUser = $request->user();

        StoryLike::where('story_id', $story->id)
            ->where('user_id', $currentUser->id)
            ->delete();

        return response()->json([
            'message' => 'Story unliked',
            'like_count' => $story->like_count,
        ]);
    }

    /**
     * Reply to a story (creates a private conversation and sends the reply as a message)
     * POST /api/stories/{storyId}/reply
     */
    public function reply(Request $request, $storyId)
    {
        $story = Story::with('user')->findOrFail($storyId);
        $currentUser = $request->user();

        if ($story->user_id === $currentUser->id) {
            return response()->json(['message' => 'Cannot reply to your own story'], 400);
        }

        if (!$this->canViewStories($currentUser, $story->user)) {
            return response()->json(['message' => 'You cannot interact with this story'], 403);
        }

        $validated = $request->validate([
            'content' => 'required|string|max:1000',
        ]);

        // Find or create a private conversation between the two users
        $conversation = \App\Models\Conversation::where('type', 'private')
            ->whereHas('members', function ($q) use ($currentUser) {
                $q->where('user_id', $currentUser->id);
            })
            ->whereHas('members', function ($q) use ($story) {
                $q->where('user_id', $story->user_id);
            })
            ->first();

        if (!$conversation) {
            $conversation = \App\Models\Conversation::create(['type' => 'private']);
            $conversation->conversationMembers()->createMany([
                ['user_id' => $currentUser->id],
                ['user_id' => $story->user_id],
            ]);
        }

        // Send the reply as a message linked to the story
        $message = \App\Models\Message::create([
            'conversation_id' => $conversation->id,
            'user_id' => $currentUser->id,
            'content' => $validated['content'],
            'story_id' => $story->id,
        ]);

        $message->load('user:id,name,username,avatar_url');
        $message->story_media_url = "/api/stories/{$story->id}/media";
        $message->story_media_type = $story->media_type;
        $message->story_owner = $story->user->name;
        $message->story_expired = false;

        return response()->json([
            'message' => 'Reply sent',
            'conversation_id' => $conversation->id,
            'data' => $message,
        ]);
    }

    /**
     * Delete own story
     * DELETE /api/stories/{storyId}
     */
    public function destroy(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        $currentUser = $request->user();

        if ($story->user_id !== $currentUser->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Delete media file
        Storage::disk('local')->delete($story->media_path);

        $story->delete();

        return response()->json(['message' => 'Story deleted']);
    }

    /**
     * Update own story caption
     * PUT /api/stories/{storyId}
     */
    public function update(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        $currentUser = $request->user();

        if ($story->user_id !== $currentUser->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'caption' => 'nullable|string|max:500',
        ]);

        $story->update([
            'caption' => $validated['caption'] ?? null,
        ]);

        $mentionedUserIds = $this->createStoryMentionNotifications(
            $currentUser,
            $story,
            $validated['caption'] ?? null
        );

        return response()->json([
            'message' => 'Story updated',
            'story' => $this->formatStory($story->fresh(), $currentUser),
            'mentioned_user_ids' => $mentionedUserIds,
        ]);
    }

    /**
     * Repost a story if the current user was mentioned in it.
     * POST /api/stories/{storyId}/repost
     */
    public function repost(Request $request, $storyId)
    {
        $validated = $request->validate([
            'caption' => 'nullable|string|max:500',
        ]);

        $sourceStory = Story::with('user:id,name,username')
            ->active()
            ->findOrFail($storyId);

        $currentUser = $request->user();

        $wasMentioned = UserNotification::where('recipient_id', $currentUser->id)
            ->where('story_id', $sourceStory->id)
            ->where('type', 'mention_story')
            ->exists();

        if (!$wasMentioned) {
            return response()->json([
                'message' => 'You can only repost stories where you were mentioned.',
            ], 403);
        }

        if (!Storage::disk('local')->exists($sourceStory->media_path)) {
            return response()->json(['message' => 'Original story media not found'], 404);
        }

        $extension = pathinfo((string) $sourceStory->media_path, PATHINFO_EXTENSION);
        $newPath = 'stories/reposts/' . uniqid('story_', true) . ($extension ? ('.' . $extension) : '');

        if (!Storage::disk('local')->copy($sourceStory->media_path, $newPath)) {
            return response()->json(['message' => 'Failed to repost story media'], 500);
        }

        $repostedStory = Story::create([
            'user_id' => $currentUser->id,
            'media_path' => $newPath,
            'media_type' => $sourceStory->media_type,
            'caption' => $validated['caption'] ?? $sourceStory->caption,
            'repost_of_story_id' => $sourceStory->id,
            'repost_from_user_id' => $sourceStory->user_id,
            'expires_at' => now()->addHours(24),
        ]);

        $repostedStory->load('repostFromUser:id,name,username,avatar_url,is_approved');

        return response()->json([
            'message' => 'Story reposted successfully',
            'story' => $this->formatStory($repostedStory, $currentUser),
        ], 201);
    }

    /**
     * Get story media (serves the private file)
     * GET /api/stories/{storyId}/media
     */
    public function media(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);

        // Support token via query param for direct media access (img/video src)
        $currentUser = $request->user();
        if (!$currentUser && $request->query('token')) {
            $currentUser = \Laravel\Sanctum\PersonalAccessToken::findToken($request->query('token'))?->tokenable;
        }

        if (!$currentUser) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // Check if viewer can view this story
        if (!$this->canViewStories($currentUser, $story->user)) {
            return response()->json(['message' => 'You cannot view this story'], 403);
        }

        if (!Storage::disk('local')->exists($story->media_path)) {
            return response()->json(['message' => 'Media not found'], 404);
        }

        $path = Storage::disk('local')->path($story->media_path);

        $mimeType = Storage::disk('local')->mimeType($story->media_path)
            ?: ($story->media_type === 'video' ? 'video/mp4' : 'application/octet-stream');

        return response()->file($path, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /**
     * Check if a user can view another user's stories
     */
    private function canViewStories(User $viewer, User $storyOwner): bool
    {
        // Can always view own stories
        if ($viewer->id === $storyOwner->id) {
            return true;
        }

        // Check if viewer follows the story owner (accepted status)
        return Follow::where('follower_id', $viewer->id)
            ->where('following_id', $storyOwner->id)
            ->where('status', 'accepted')
            ->exists();
    }

    /**
     * Format a story for API response
     */
    private function formatStory(Story $story, User $viewer): array
    {
        $isMentionedForViewer = $story->user_id !== $viewer->id && UserNotification::where('recipient_id', $viewer->id)
            ->where('story_id', $story->id)
            ->where('type', 'mention_story')
            ->exists();

        return [
            'id' => $story->id,
            'user_id' => $story->user_id,
            'media_type' => $story->media_type,
            'caption' => $story->caption,
            'media_url' => "/api/stories/{$story->id}/media",
            'is_viewed' => $story->hasBeenViewedBy($viewer->id) || $story->user_id === $viewer->id,
            'is_liked' => $story->hasBeenLikedBy($viewer->id),
            'is_mentioned_for_viewer' => $isMentionedForViewer,
            'repost' => $story->repost_from_user_id ? [
                'source_story_id' => $story->repost_of_story_id,
                'from_user' => $story->repostFromUser ? [
                    'id' => $story->repostFromUser->id,
                    'name' => $story->repostFromUser->name,
                    'username' => $story->repostFromUser->username,
                    'avatar_url' => $story->repostFromUser->avatar_url,
                    'is_approved' => $story->repostFromUser->is_approved,
                ] : null,
            ] : null,
            'view_count' => $story->user_id === $viewer->id ? $story->view_count : null,
            'like_count' => $story->user_id === $viewer->id ? $story->like_count : null,
            'created_at' => $story->created_at,
            'expires_at' => $story->expires_at,
        ];
    }

    private function createStoryMentionNotifications(User $actor, Story $story, ?string $caption): array
    {
        $mentionedUsers = $this->extractMentionedUsers($caption, $actor->id);
        if ($mentionedUsers->isEmpty()) {
            return [];
        }

        $message = "{$actor->name} mentioned you in their story.";

        foreach ($mentionedUsers as $mentionedUser) {
            UserNotification::create([
                'recipient_id' => $mentionedUser->id,
                'actor_id' => $actor->id,
                'type' => 'mention_story',
                'story_id' => $story->id,
                'message' => $message,
                'is_read' => false,
            ]);
        }

        return $mentionedUsers->pluck('id')->values()->all();
    }

    private function extractMentionedUsers(?string $text, int $excludeUserId)
    {
        $content = (string) ($text ?? '');
        if ($content === '') {
            return collect();
        }

        preg_match_all('/(^|\\s)@([A-Za-z0-9_]{3,30})/u', $content, $matches);
        $usernames = collect($matches[2] ?? [])
            ->map(fn($username) => strtolower(trim((string) $username)))
            ->filter()
            ->unique()
            ->values();

        if ($usernames->isEmpty()) {
            return collect();
        }

        return User::whereIn(DB::raw('LOWER(username)'), $usernames->all())
            ->where('id', '!=', $excludeUserId)
            ->get(['id', 'username']);
    }
}
