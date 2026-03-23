<?php

namespace App\Http\Controllers;

use App\Models\MediaAttachment;
use App\Models\ConversationMember;
use App\Models\Follow;
use App\Models\Message;
use App\Models\MessageReaction;
use App\Models\MessageStatus;
use App\Models\Post;
use App\Models\Story;
use App\Models\StarredMessage;
use App\Models\User;
use App\Services\PushNotificationService;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    private const SHARED_STORY_CONTENT = '[Shared story]';
    private const SHARED_POST_CONTENT = '[Shared post]';

    protected $pushNotificationService;

    public function __construct(PushNotificationService $pushNotificationService)
    {
        $this->pushNotificationService = $pushNotificationService;
    }

    /**
     * Get messages from conversation (paginated)
     * GET /api/conversations/{id}/messages?page=1&limit=50
     */
    public function index($conversationId, Request $request)
    {
        try {
            $limit = max(1, min((int) $request->query('limit', 50), 100)); // Max 100
            $userId = auth()->id();

            // Verify user is a member of this conversation
            $memberRecord = ConversationMember::where('conversation_id', $conversationId)
                ->where('user_id', $userId)
                ->first();

            if (!$memberRecord) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $messagesQuery = Message::query()
                ->select([
                    'id',
                    'conversation_id',
                    'user_id',
                    'content',
                    'story_id',
                    'post_id',
                    'edited_at',
                    'created_at',
                ])
                ->where('conversation_id', $conversationId)
                ->with([
                    'user:id,name,username,avatar_url,is_approved',
                    'reactions:id,message_id,user_id,emoji',
                    'attachments:id,message_id,type,file_path,original_filename,mime_type',
                    'statuses:id,message_id,user_id,status',
                    'story:id,user_id,media_type,media_path,caption,expires_at',
                    'story.user:id,name,username',
                    'post:id,user_id,caption,image_url,media_urls,original_post_id',
                    'post.user:id,name,username,avatar_url,is_approved',
                    'post.originalPost:id,user_id,caption,image_url,media_urls',
                    'post.originalPost.user:id,name,username,avatar_url,is_approved',
                ])
                ->orderBy('created_at', 'desc');

            if ($memberRecord->deleted_at) {
                $messagesQuery->where('created_at', '>', $memberRecord->deleted_at);
            }

            $messages = $messagesQuery->paginate($limit);

            // Add status field and story media URL to each message
            $viewer = $request->user();

            $messages->getCollection()->transform(function ($message) use ($viewer) {
                return $this->transformMessageForViewer($message, $viewer);
            });

            return response()->json($messages, 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get messages',
            ], 500);
        }
    }

    /**
     * Send message
     * POST /api/conversations/{id}/messages
     * Body: { content }
     */
    public function store(Request $request, $conversationId)
    {
        try {
            $validated = $request->validate([
                'content' => 'required|string|max:5000',
                'media_id' => 'nullable|integer|exists:media_attachments,id',
                'media_ids' => 'nullable|array|max:10',
                'media_ids.*' => 'integer|exists:media_attachments,id',
                'story_id' => 'nullable|integer|exists:stories,id',
                'post_id' => 'nullable|integer|exists:posts,id',
            ]);

            \Log::info('Message store request', [
                'media_id' => $validated['media_id'] ?? null,
                'media_ids' => $validated['media_ids'] ?? null,
                'content' => $validated['content'],
            ]);

            $user = auth()->user();

            if (!empty($validated['story_id']) && !empty($validated['post_id'])) {
                return response()->json([
                    'message' => 'A message can reference either a story or a post, not both.',
                ], 422);
            }

            // Verify user is a member of this conversation
            $memberRecord = ConversationMember::where('conversation_id', $conversationId)
                ->where('user_id', $user->id)
                ->first();

            if (!$memberRecord) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $conversation = $memberRecord->conversation()->with('members:id')->first();
            if ($conversation?->type === 'private') {
                $otherUser = $conversation->members->firstWhere('id', '!=', $user->id);

                if ($otherUser && $user->hasBlockedRelationshipWith($otherUser)) {
                    return response()->json([
                        'message' => 'You cannot message this user because one of you has blocked the other.',
                    ], 403);
                }
            }

            // Restore this conversation for sender if they had deleted it locally.
            if ($memberRecord->deleted_at) {
                $memberRecord->deleted_at = null;
                $memberRecord->save();
            }

            $story = null;
            if (!empty($validated['story_id'])) {
                $story = Story::with('user:id,name,username')->findOrFail($validated['story_id']);

                if (!$this->canViewStory($user, $story)) {
                    return response()->json(['message' => 'You cannot share this story'], 403);
                }
            }

            $post = null;
            if (!empty($validated['post_id'])) {
                $post = Post::with('user:id,name,username,avatar_url,is_approved')->findOrFail($validated['post_id']);

                if (!$this->canViewPost($user, $post)) {
                    return response()->json(['message' => 'You cannot share this post'], 403);
                }
            }

            $message = Message::create([
                'conversation_id' => $conversationId,
                'user_id' => $user->id,
                'content' => $validated['content'],
                'story_id' => $story?->id,
                'post_id' => $post?->id,
            ]);

            // Update conversation timestamp to reflect new message activity
            $conversation->touch();

            // Handle single media_id (backward compatibility)
            if (!empty($validated['media_id'])) {
                MediaAttachment::where('id', $validated['media_id'])
                    ->whereNull('message_id')
                    ->update(['message_id' => $message->id]);
            }

            // Handle multiple media_ids (new feature)
            if (!empty($validated['media_ids']) && is_array($validated['media_ids'])) {
                MediaAttachment::whereIn('id', $validated['media_ids'])
                    ->whereNull('message_id')
                    ->update(['message_id' => $message->id]);
            }

            $message->load([
                'user:id,name,username,avatar_url,is_approved',
                'reactions',
                'attachments',
                'statuses',
                'story:id,user_id,media_type,media_path,caption,expires_at',
                'story.user:id,name,username',
                'post:id,user_id,caption,image_url,media_urls,original_post_id',
                'post.user:id,name,username,avatar_url,is_approved',
                'post.originalPost:id,user_id,caption,image_url,media_urls',
                'post.originalPost.user:id,name,username,avatar_url,is_approved',
            ]);

            $message = $this->transformMessageForViewer($message, $user);

            // Emit WebSocket event (will implement later)
            // broadcast(new MessageSent($message));

            $participantIds = ConversationMember::where('conversation_id', $conversationId)
                ->pluck('user_id')
                ->all();

            // Send push notifications to other participants
            $otherParticipants = User::whereIn('id', $participantIds)
                ->where('id', '!=', $user->id)
                ->get();

            // Create message preview
            $preview = $message->content;
            if (strlen($preview) > 100) {
                $preview = substr($preview, 0, 100) . '...';
            }

            foreach ($otherParticipants as $participant) {
                // Send push notification (service handles multiple devices per user)
                $this->pushNotificationService->sendMessageNotification(
                    $participant,
                    $user,
                    $preview,
                    $conversationId
                );
            }

            return response()->json([
                'message' => 'Message sent',
                'data' => $message,
                'member_ids' => $participantIds,
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to send message',
            ], 500);
        }
    }

    /**
     * Edit message
     * PUT /api/messages/{id}
     * Body: { content }
     */
    public function update(Request $request, $id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            // Check if user is the author
            if ($message->user_id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized - only author can edit',
                ], 403);
            }

            $validated = $request->validate([
                'content' => 'required|string|max:5000',
            ]);

            // Update message
            $message->update([
                'content' => $validated['content'],
                'edited_at' => now(),
            ]);

            return response()->json([
                'message' => 'Message updated',
                'data' => $message,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update message',
            ], 500);
        }
    }

    /**
     * Delete message
     * DELETE /api/messages/{id}
     */
    public function destroy($id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            // Check if user is the author
            if ($message->user_id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized - only author can delete',
                ], 403);
            }

            // Soft delete (mark as deleted)
            $message->update([
                'content' => '[Message deleted]',
            ]);

            return response()->json([
                'message' => 'Message deleted',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete message',
            ], 500);
        }
    }

    /**
     * Add reaction to message
     * POST /api/messages/{id}/reactions
     * Body: { emoji }
     */
    public function addReaction(Request $request, $id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            $validated = $request->validate([
                'emoji' => 'required|string|max:10',
            ]);

            // Try to create reaction (will fail if duplicate)
            try {
                MessageReaction::create([
                    'message_id' => $id,
                    'user_id' => $user->id,
                    'emoji' => $validated['emoji'],
                ]);
            } catch (\Exception $e) {
                return response()->json([
                    'message' => 'You already reacted with this emoji',
                ], 400);
            }

            return response()->json([
                'message' => 'Reaction added',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to add reaction',
            ], 500);
        }
    }

    /**
     * Remove reaction
     * DELETE /api/messages/{id}/reactions/{emoji}
     */
    public function removeReaction($id, $emoji)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            $deleted = MessageReaction::where('message_id', $id)
                ->where('user_id', $user->id)
                ->where('emoji', $emoji)
                ->delete();

            if ($deleted === 0) {
                return response()->json([
                    'message' => 'Reaction not found',
                ], 404);
            }

            return response()->json([
                'message' => 'Reaction removed',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to remove reaction',
            ], 500);
        }
    }

    /**
     * Star message
     * POST /api/messages/{id}/star
     */
    public function star($id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            // Check if already starred
            $exists = StarredMessage::where('message_id', $id)
                ->where('user_id', $user->id)
                ->exists();

            if ($exists) {
                return response()->json([
                    'message' => 'Message already starred',
                ], 400);
            }

            StarredMessage::create([
                'message_id' => $id,
                'user_id' => $user->id,
            ]);

            return response()->json([
                'message' => 'Message starred',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to star message',
            ], 500);
        }
    }

    /**
     * Unstar message
     * DELETE /api/messages/{id}/star
     */
    public function unstar($id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            $deleted = StarredMessage::where('message_id', $id)
                ->where('user_id', $user->id)
                ->delete();

            if ($deleted === 0) {
                return response()->json([
                    'message' => 'Message not starred',
                ], 400);
            }

            return response()->json([
                'message' => 'Message unstarred',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to unstar message',
            ], 500);
        }
    }

    /**
     * Mark message as delivered
     * PUT /api/messages/{id}/status/delivered
     */
    public function markDelivered($id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            // Verify user is a member of the message's conversation
            $isMember = \App\Models\ConversationMember::where('conversation_id', $message->conversation_id)
                ->where('user_id', $user->id)->exists();
            if (!$isMember) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            // Create or update status
            MessageStatus::updateOrCreate(
                [
                    'message_id' => $id,
                    'user_id' => $user->id,
                ],
                [
                    'status' => 'delivered',
                ]
            );

            return response()->json([
                'message' => 'Message marked as delivered',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to mark as delivered',
            ], 500);
        }
    }

    /**
     * Mark message as seen
     * PUT /api/messages/{id}/status/seen
     */
    public function markSeen($id)
    {
        try {
            $message = Message::find($id);
            $user = auth()->user();

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            // Verify user is a member of the message's conversation
            $isMember = \App\Models\ConversationMember::where('conversation_id', $message->conversation_id)
                ->where('user_id', $user->id)->exists();
            if (!$isMember) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            // Update to seen status
            MessageStatus::updateOrCreate(
                [
                    'message_id' => $id,
                    'user_id' => $user->id,
                ],
                [
                    'status' => 'seen',
                ]
            );

            return response()->json([
                'message' => 'Message marked as seen',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to mark as seen',
            ], 500);
        }
    }

    /**
     * Get message read receipts
     * GET /api/messages/{id}/status
     */
    public function getStatus($id)
    {
        try {
            $message = Message::find($id);

            if (!$message) {
                return response()->json([
                    'message' => 'Message not found',
                ], 404);
            }

            // Verify user is a member of the message's conversation
            $isMember = \App\Models\ConversationMember::where('conversation_id', $message->conversation_id)
                ->where('user_id', auth()->id())->exists();
            if (!$isMember) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $statuses = MessageStatus::where('message_id', $id)
                ->with('user:id,name,avatar_url')
                ->get();

            return response()->json([
                'statuses' => $statuses,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get status',
            ], 500);
        }
    }

    /**
     * Bulk mark all unseen messages in a conversation as seen.
     * PUT /api/conversations/{id}/mark-seen
     * Returns the DB-computed total unread count across ALL conversations.
     */
    public function markConversationSeen($conversationId)
    {
        try {
            $user = auth()->user();

            // Verify user is a member of this conversation
            $memberRecord = ConversationMember::where('conversation_id', $conversationId)
                ->where('user_id', $user->id)
                ->first();

            if (!$memberRecord) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $unseenMessagesQuery = Message::where('conversation_id', $conversationId)
                ->where('user_id', '!=', $user->id)
                ->whereDoesntHave('statuses', function ($q) use ($user) {
                    $q->where('user_id', $user->id)->where('status', 'seen');
                });

            if ($memberRecord->deleted_at) {
                $unseenMessagesQuery->where('created_at', '>', $memberRecord->deleted_at);
            }

            $unseenMessages = $unseenMessagesQuery->pluck('id');

            // Bulk upsert seen statuses
            foreach ($unseenMessages as $msgId) {
                MessageStatus::updateOrCreate(
                    ['message_id' => $msgId, 'user_id' => $user->id],
                    ['status' => 'seen']
                );
            }

            // Compute total unread count from DB
            $totalUnread = $this->computeTotalUnread($user->id);

            return response()->json([
                'message' => 'Conversation marked as seen',
                'marked_count' => $unseenMessages->count(),
                'total_unread' => $totalUnread,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to mark conversation as seen',
            ], 500);
        }
    }

    /**
     * Get total unread message count across all conversations (DB-driven).
     * GET /api/messages/unread-count
     */
    public function getUnreadCount()
    {
        try {
            $user = auth()->user();
            $totalUnread = $this->computeTotalUnread($user->id);

            return response()->json([
                'unread_count' => $totalUnread,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get unread count',
            ], 500);
        }
    }

    /**
     * Compute total unread messages for a user across all their conversations.
     */
    private function computeTotalUnread($userId)
    {
        $memberships = ConversationMember::where('user_id', $userId)
            ->get(['conversation_id', 'deleted_at']);

        $totalUnread = 0;

        foreach ($memberships as $membership) {
            $query = Message::where('conversation_id', $membership->conversation_id)
                ->where('user_id', '!=', $userId)
                ->whereDoesntHave('statuses', function ($q) use ($userId) {
                    $q->where('user_id', $userId)->where('status', 'seen');
                });

            if ($membership->deleted_at) {
                $query->where('created_at', '>', $membership->deleted_at);
            }

            $totalUnread += $query->count();
        }

        return $totalUnread;
    }

    private function transformMessageForViewer(Message $message, User $viewer): Message
    {
        $viewerId = $viewer->id;
        $isDeleted = trim((string) $message->content) === '[Message deleted]';

        if ($message->relationLoaded('statuses')) {
            if ($message->user_id == $viewerId) {
                $statuses = $message->statuses->where('user_id', '!=', $viewerId);
                if ($statuses->contains('status', 'seen')) {
                    $message->status = 'seen';
                } elseif ($statuses->contains('status', 'delivered')) {
                    $message->status = 'delivered';
                } else {
                    $message->status = 'sent';
                }
            } else {
                $myStatus = $message->statuses->where('user_id', $viewerId)->first();
                $message->status = $myStatus ? $myStatus->status : 'sent';
            }
        } elseif (!isset($message->status)) {
            $message->status = $message->user_id == $viewerId ? 'sent' : 'sent';
        }

        $message->deleted = $isDeleted;

        if ($isDeleted) {
            $message->setRelation('attachments', collect());
            $message->story_id = null;
            $message->post_id = null;
            unset($message->statuses);
            return $message;
        }

        if ($message->story) {
            $message->story_context = trim((string) $message->content) === self::SHARED_STORY_CONTENT ? 'shared' : 'reply';

            $idMatch = (string)$message->story->id === (string)$message->story_id;
            $canView = $this->canViewStory($viewer, $message->story);
            $isExpired = $message->story->expires_at->isPast();

            if ($idMatch && $canView) {
                $message->story_media_url = "/api/stories/{$message->story_id}/media";
                $message->story_media_type = $message->story->media_type;
                $message->story_owner = $message->story->user?->name ?? 'Unknown';
                $message->story_caption = $message->story->caption;
                $message->story_expired = $isExpired;
            } else {
                $message->story_unavailable = true;
                \Log::info('Story unavailable in chat reply', [
                    'story_id' => $message->story_id,
                    'story_exists' => $message->story ? true : false,
                    'id_match' => $idMatch,
                    'can_view' => $canView,
                    'is_expired' => $isExpired,
                    'viewer_id' => $viewer->id,
                    'story_user_id' => $message->story ? $message->story->user_id : null,
                ]);
            }
        }

        if ($message->post) {
            $message->post_context = trim((string) $message->content) === self::SHARED_POST_CONTENT ? 'shared' : 'linked';

            if ($this->canViewPost($viewer, $message->post)) {
                $previewPost = $message->post->originalPost ?: $message->post;
                $message->post_owner = $previewPost->user?->name ?? 'Unknown';
                $message->post_owner_username = $previewPost->user?->username;
                $message->post_caption = $previewPost->caption;
                $message->post_image_url = $previewPost->image_url;
                $message->post_media_urls = $previewPost->media_urls;
            } else {
                $message->post_unavailable = true;
            }
        }

        unset($message->statuses);
        return $message;
    }

    private function canViewStory(User $viewer, Story $story): bool
    {
        // Allow if story is not expired and not blocked
        $isOwner = (string)$viewer->id === (string)$story->user_id;
        $isExpired = $story->expires_at->isPast();
        $blocked = $viewer->hasBlockedRelationshipWith($story->user);

        \Log::info('canViewStory debug', [
            'viewer_id' => $viewer->id,
            'story_user_id' => $story->user_id,
            'is_owner' => $isOwner,
            'is_expired' => $isExpired,
            'blocked' => $blocked,
        ]);

        if ($isOwner) return true;
        if ($isExpired) return false;
        if ($blocked) return false;
        return true;
    }

    private function canViewPost(User $viewer, Post $post): bool
    {
        $post->loadMissing('user');

        return $viewer->id === $post->user_id || $viewer->canViewProfile($post->user);
    }
}
