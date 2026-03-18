<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\PostLike;
use App\Models\UserNotification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class PostController extends Controller
{
    /**
     * Get feed posts (from users the current user follows)
     * GET /api/feed
     */
    public function feed(Request $request)
    {
        $user = $request->user();
        $feedWindowStart = now()->subDays(2);
        $followingIds = $user->following()->pluck('users.id')->toArray();
        $followingIds[] = $user->id; // Include own posts

        $posts = Post::where('created_at', '>=', $feedWindowStart)
            ->where(function ($query) use ($followingIds, $user) {
                // Keep followed + own posts.
                $query->whereIn('user_id', $followingIds)
                    // Mix in discover content from unfollowed public users (image posts only).
                    ->orWhere(function ($discover) use ($followingIds, $user) {
                        $discover->whereNotIn('user_id', $followingIds)
                            ->where('user_id', '!=', $user->id)
                            ->whereNotNull('image_url')
                            ->whereHas('user', function ($userQuery) {
                                $userQuery->where('is_private', false)
                                    ->where('is_approved', true)
                                    ->where('is_banned', false);
                            });
                    });
            })
            ->with([
                'user:id,name,username,avatar_url,is_approved',
                'originalPost.user:id,name,username,avatar_url,is_approved',
            ])
            ->withCount(['likes', 'comments'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        // Add isLiked flag for each post
        $posts->getCollection()->transform(function ($post) use ($user) {
            $post->is_liked = $post->isLikedBy($user);
            return $post;
        });

        return response()->json($posts);
    }

    /**
     * Get a user's posts
     * GET /api/users/{userId}/posts
     */
    public function userPosts(Request $request, $userId)
    {
        $user = User::findOrFail($userId);
        $currentUser = $request->user();

        // Check privacy
        if (!$currentUser->canViewProfile($user)) {
            return response()->json(['message' => 'This account is private'], 403);
        }

        $posts = $user->posts()
            ->with(['originalPost.user:id,name,username,avatar_url,is_approved'])
            ->withCount(['likes', 'comments'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        $posts->getCollection()->transform(function ($post) use ($currentUser) {
            $post->is_liked = $post->isLikedBy($currentUser);
            return $post;
        });

        return response()->json($posts);
    }

    /**
     * Create a new post
     * POST /api/posts
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'caption' => 'nullable|string|max:2200',
            'image' => 'nullable|file|max:25600', // 25MB max
            'images' => 'nullable|array|max:8',
            'images.*' => 'file|max:25600',
        ], [
            'image.max' => 'Post image must be less than 25MB.',
            'images.max' => 'You can upload up to 8 images per post.',
            'images.*.max' => 'Each post image must be less than 25MB.',
        ]);

        $files = [];
        if ($request->hasFile('images')) {
            $files = array_merge($files, $request->file('images'));
        }
        if ($request->hasFile('image')) {
            $files[] = $request->file('image');
        }

        if (count($files) > 8) {
            return response()->json(['message' => 'You can upload up to 8 images per post.'], 422);
        }

        foreach ($files as $imageFile) {
            $mimeType = strtolower((string) $imageFile?->getMimeType());
            $extension = strtolower((string) $imageFile?->getClientOriginalExtension());

            $isImageMime = str_starts_with($mimeType, 'image/');
            $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif'];
            $isImageExtension = in_array($extension, $imageExtensions, true);

            if (!$isImageMime && !$isImageExtension) {
                throw ValidationException::withMessages([
                    'image' => ['Please upload an image file (JPG, PNG, WebP, HEIC, HEIF, AVIF).'],
                ]);
            }
        }

        // Must have at least caption or image
        if (empty($validated['caption']) && count($files) === 0) {
            return response()->json(['message' => 'Post must have a caption or image'], 400);
        }

        $imagePaths = [];
        foreach ($files as $file) {
            $imagePaths[] = $file->store('posts', 'public');
        }

        $post = Post::create([
            'user_id' => $request->user()->id,
            'caption' => $validated['caption'] ?? null,
            'image_url' => $imagePaths[0] ?? null,
            'media_urls' => count($imagePaths) > 0 ? $imagePaths : null,
        ]);

        $mentionedUserIds = $this->createPostMentionNotifications(
            $request->user(),
            $post,
            $validated['caption'] ?? null
        );

        $post->load('user:id,name,username,avatar_url,is_approved');

        $post->mentioned_user_ids = $mentionedUserIds;

        return response()->json($post, 201);
    }

    /**
     * Get a single post
     * GET /api/posts/{postId}
     */
    public function show(Request $request, $postId)
    {
        $post = Post::with([
            'user:id,name,username,avatar_url,is_approved',
            'originalPost.user:id,name,username,avatar_url,is_approved',
            'comments' => function ($query) {
                $query->with('user:id,name,username,avatar_url,is_approved')
                    ->withCount('replies')
                    ->orderBy('created_at', 'desc')
                    ->limit(10);
            },
        ])
        ->withCount(['likes', 'comments'])
        ->findOrFail($postId);

        $currentUser = $request->user();

        // Check if current user can view the post owner's profile
        if (!$currentUser->canViewProfile($post->user)) {
            return response()->json(['message' => 'This post is from a private account'], 403);
        }

        $post->is_liked = $post->isLikedBy($currentUser);

        return response()->json($post);
    }

    /**
     * Update own post caption
     * PUT /api/posts/{postId}
     */
    public function update(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);
        $user = $request->user();

        if ($post->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'caption' => 'nullable|string|max:2200',
        ]);

        $post->update([
            'caption' => $validated['caption'] ?? null,
        ]);

        $mentionedUserIds = $this->createPostMentionNotifications(
            $user,
            $post,
            $validated['caption'] ?? null
        );

        $post->load('user:id,name,username,avatar_url,is_approved');
        $post->mentioned_user_ids = $mentionedUserIds;

        return response()->json([
            'message' => 'Post updated',
            'post' => $post,
            'mentioned_user_ids' => $mentionedUserIds,
        ]);
    }

    /**
     * Delete a post
     * DELETE /api/posts/{postId}
     */
    public function destroy(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);

        // Only owner can delete (admin deletion is through admin routes)
        if ($post->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $mediaPaths = [];
        if (is_array($post->media_urls) && count($post->media_urls) > 0) {
            $mediaPaths = $post->media_urls;
        } elseif ($post->image_url) {
            $mediaPaths = [$post->image_url];
        }

        foreach ($mediaPaths as $rawPath) {
            $imagePath = $this->normalizePublicPath($rawPath);
            if ($imagePath) {
                Storage::disk('public')->delete($imagePath);
            }
        }

        $post->delete();

        return response()->json(['message' => 'Post deleted']);
    }

    /**
     * Like a post
     * POST /api/posts/{postId}/like
     */
    public function like(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);
        $user = $request->user();

        // Check privacy
        if (!$user->canViewProfile($post->user)) {
            return response()->json(['message' => 'Cannot like posts from private accounts you do not follow'], 403);
        }

        // Check if already liked
        if ($post->isLikedBy($user)) {
            return response()->json(['message' => 'Already liked'], 400);
        }

        PostLike::create([
            'user_id' => $user->id,
            'post_id' => $post->id,
        ]);

        $post->increment('likes_count');

        return response()->json(['message' => 'Post liked', 'likes_count' => $post->fresh()->likes_count]);
    }

    /**
     * Unlike a post
     * DELETE /api/posts/{postId}/like
     */
    public function unlike(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);
        $user = $request->user();

        $like = PostLike::where('user_id', $user->id)
            ->where('post_id', $post->id)
            ->first();

        if (!$like) {
            return response()->json(['message' => 'Not liked'], 400);
        }

        $like->delete();
        $post->decrement('likes_count');

        return response()->json(['message' => 'Post unliked', 'likes_count' => $post->fresh()->likes_count]);
    }

    /**
     * Share/Repost a post
     * POST /api/posts/{postId}/share
     */
    public function share(Request $request, $postId)
    {
        $originalPost = Post::findOrFail($postId);
        $user = $request->user();

        // Check privacy
        if (!$user->canViewProfile($originalPost->user)) {
            return response()->json(['message' => 'Cannot share posts from private accounts you do not follow'], 403);
        }

        // Cannot repost a repost - get the original
        $sourcePostId = $originalPost->original_post_id ?? $originalPost->id;

        $validated = $request->validate([
            'caption' => 'nullable|string|max:2200',
        ]);

        $repost = Post::create([
            'user_id' => $user->id,
            'caption' => $validated['caption'] ?? null,
            'original_post_id' => $sourcePostId,
        ]);

        $mentionedUserIds = $this->createPostMentionNotifications(
            $user,
            $repost,
            $validated['caption'] ?? null
        );

        // Increment share count on original
        Post::find($sourcePostId)->increment('shares_count');

        $repost->load(['user:id,name,username,avatar_url,is_approved', 'originalPost.user:id,name,username,avatar_url,is_approved']);
        $repost->mentioned_user_ids = $mentionedUserIds;

        return response()->json($repost, 201);
    }

    private function createPostMentionNotifications(User $actor, Post $post, ?string $caption): array
    {
        $mentionedUsers = $this->extractMentionedUsers($caption, $actor->id);
        if ($mentionedUsers->isEmpty()) {
            return [];
        }

        $message = "{$actor->name} mentioned you in their post.";

        foreach ($mentionedUsers as $mentionedUser) {
            UserNotification::create([
                'recipient_id' => $mentionedUser->id,
                'actor_id' => $actor->id,
                'type' => 'mention_post',
                'post_id' => $post->id,
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

    private function normalizePublicPath(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        $normalized = trim($path);
        if (preg_match('/^https?:\/\//i', $normalized)) {
            $parsedPath = parse_url($normalized, PHP_URL_PATH);
            $normalized = is_string($parsedPath) ? $parsedPath : '';
        }

        $normalized = ltrim($normalized, '/');
        if (str_starts_with($normalized, 'storage/')) {
            $normalized = substr($normalized, strlen('storage/'));
        }

        return ltrim($normalized, '/');
    }
}
