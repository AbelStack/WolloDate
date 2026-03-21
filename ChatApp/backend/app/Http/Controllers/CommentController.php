<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\CommentLike;
use App\Models\Post;
use App\Models\UserNotification;
use Illuminate\Http\Request;

class CommentController extends Controller
{
    /**
     * Get comments for a post
     * GET /api/posts/{postId}/comments
     */
    public function index(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);
        $currentUser = $request->user();

        // Check privacy
        if (!$currentUser->canViewProfile($post->user)) {
            return response()->json(['message' => 'Cannot view comments on private posts'], 403);
        }

        $comments = $post->comments()
            ->with([
                'user:id,name,username,avatar_url,is_approved',
                'replies' => function ($query) {
                    $query->with('user:id,name,username,avatar_url,is_approved')
                        ->orderBy('created_at', 'asc')
                        ->limit(3);
                },
            ])
            ->withCount('replies')
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        // Add isLiked flag
        $comments->getCollection()->transform(function ($comment) use ($currentUser) {
            $comment->is_liked = $comment->isLikedBy($currentUser);
            if ($comment->relationLoaded('replies')) {
                $comment->replies->transform(function ($reply) use ($currentUser) {
                    $reply->is_liked = $reply->isLikedBy($currentUser);
                    return $reply;
                });
            }
            return $comment;
        });

        return response()->json($comments);
    }

    /**
     * Add a comment to a post
     * POST /api/posts/{postId}/comments
     */
    public function store(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);
        $currentUser = $request->user();

        // Check privacy
        if (!$currentUser->canViewProfile($post->user)) {
            return response()->json(['message' => 'Cannot comment on private posts'], 403);
        }

        $validated = $request->validate([
            'content' => 'required|string|max:1000',
            'parent_id' => 'nullable|exists:comments,id',
        ]);

        // If replying, verify parent comment belongs to this post
        if (!empty($validated['parent_id'])) {
            $parentComment = Comment::where('id', $validated['parent_id'])
                ->where('post_id', $postId)
                ->firstOrFail();
        }

        $comment = Comment::create([
            'user_id' => $currentUser->id,
            'post_id' => $post->id,
            'parent_id' => $validated['parent_id'] ?? null,
            'content' => $validated['content'],
        ]);

        $post->increment('comments_count');

        // Create notification for post owner (if commenter is not the owner)
        if ($currentUser->id !== $post->user_id) {
            UserNotification::create([
                'recipient_id' => $post->user_id,
                'actor_id' => $currentUser->id,
                'type' => 'comment',
                'post_id' => $post->id,
                'message' => 'commented on your post',
                'is_read' => false,
            ]);
        }

        $comment->load('user:id,name,username,avatar_url,is_approved');

        return response()->json($comment, 201);
    }

    /**
     * Update own comment
     * PUT /api/comments/{commentId}
     */
    public function update(Request $request, $commentId)
    {
        \Log::info('Comment action', [
            'action' => 'update',
            'commentId' => $commentId,
            'user' => $request->user() ? $request->user()->id : null,
            'token' => $request->bearerToken(),
        ]);

        $comment = Comment::findOrFail($commentId);
        $currentUser = $request->user();

        // Debug log for troubleshooting
        \Log::info('Comment update debug', [
            'currentUserId' => $currentUser ? $currentUser->id : null,
            'commentUserId' => $comment->user_id,
            'requestToken' => $request->bearerToken(),
        ]);

        if ((string)$comment->user_id !== (string)($currentUser ? $currentUser->id : null)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'content' => 'required|string|max:1000',
        ]);

        $comment->update([
            'content' => $validated['content'],
        ]);

        $comment->load('user:id,name,username,avatar_url,is_approved');

        return response()->json($comment);
    }

    /**
     * Delete a comment
     * DELETE /api/comments/{commentId}
     */
    public function destroy(Request $request, $commentId)
    {
        \Log::info('Comment action', [
            'action' => 'destroy',
            'commentId' => $commentId,
            'user' => $request->user() ? $request->user()->id : null,
            'token' => $request->bearerToken(),
        ]);

        $comment = Comment::findOrFail($commentId);
        $currentUser = $request->user();

        // Only comment owner or post owner can delete (admin deletion is through admin routes)
        $post = $comment->post;
        if ((string)$comment->user_id !== (string)($currentUser ? $currentUser->id : null)
            && (string)$post->user_id !== (string)($currentUser ? $currentUser->id : null)
        ) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Decrement comment count (including replies)
        $replyCount = $comment->replies()->count();
        $post->decrement('comments_count', 1 + $replyCount);

        $comment->delete();

        return response()->json(['message' => 'Comment deleted']);
    }

    /**
     * Like a comment
     * POST /api/comments/{commentId}/like
     */
    public function like(Request $request, $commentId)
    {
        $comment = Comment::findOrFail($commentId);
        $user = $request->user();

        // Check privacy via post owner
        if (!$user->canViewProfile($comment->post->user)) {
            return response()->json(['message' => 'Cannot like comments on private posts'], 403);
        }

        if ($comment->isLikedBy($user)) {
            return response()->json(['message' => 'Already liked'], 400);
        }

        CommentLike::create([
            'user_id' => $user->id,
            'comment_id' => $comment->id,
        ]);

        $comment->increment('likes_count');

        return response()->json(['message' => 'Comment liked', 'likes_count' => $comment->fresh()->likes_count]);
    }

    /**
     * Unlike a comment
     * DELETE /api/comments/{commentId}/like
     */
    public function unlike(Request $request, $commentId)
    {
        $comment = Comment::findOrFail($commentId);
        $user = $request->user();

        $like = CommentLike::where('user_id', $user->id)
            ->where('comment_id', $comment->id)
            ->first();

        if (!$like) {
            return response()->json(['message' => 'Not liked'], 400);
        }

        $like->delete();
        $comment->decrement('likes_count');

        return response()->json(['message' => 'Comment unliked', 'likes_count' => $comment->fresh()->likes_count]);
    }

    /**
     * Get replies to a comment
     * GET /api/comments/{commentId}/replies
     */
    public function getReplies(Request $request, $commentId)
    {
        $comment = Comment::findOrFail($commentId);
        $currentUser = $request->user();

        // Check privacy
        if (!$currentUser->canViewProfile($comment->post->user)) {
            return response()->json(['message' => 'Cannot view replies on private posts'], 403);
        }

        $replies = $comment->replies()
            ->with('user:id,name,username,avatar_url,is_approved')
            ->orderBy('created_at', 'asc')
            ->paginate(20);

        $replies->getCollection()->transform(function ($reply) use ($currentUser) {
            $reply->is_liked = $reply->isLikedBy($currentUser);
            return $reply;
        });

        return response()->json($replies);
    }

    
}
