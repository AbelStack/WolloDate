<?php

namespace App\Http\Controllers;

use App\Models\MediaAttachment;
use App\Models\ConversationMember;
use App\Models\Message;
use App\Models\MessageReaction;
use App\Models\MessageStatus;
use App\Models\StarredMessage;
use Illuminate\Http\Request;

class MessageController extends Controller
{
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
                    'edited_at',
                    'created_at',
                ])
                ->where('conversation_id', $conversationId)
                ->with([
                    'user:id,name,username,avatar_url,is_approved',
                    'reactions:id,message_id,user_id,emoji',
                    'attachments:id,message_id,type,file_path,original_filename,mime_type',
                    'statuses:id,message_id,user_id,status',
                    'story:id,user_id,media_type,media_path,expires_at',
                    'story.user:id,name,username',
                ])
                ->orderBy('created_at', 'desc');

            if ($memberRecord->deleted_at) {
                $messagesQuery->where('created_at', '>', $memberRecord->deleted_at);
            }

            $messages = $messagesQuery->paginate($limit);

            // Add status field and story media URL to each message
            $messages->getCollection()->transform(function ($message) use ($userId) {
                $isDeleted = trim((string) $message->content) === '[Message deleted]';

                if ($message->user_id == $userId) {
                    // For sender's messages: check other users' statuses
                    $statuses = $message->statuses->where('user_id', '!=', $userId);
                    if ($statuses->contains('status', 'seen')) {
                        $message->status = 'seen';
                    } elseif ($statuses->contains('status', 'delivered')) {
                        $message->status = 'delivered';
                    } else {
                        $message->status = 'sent';
                    }
                } else {
                    // For received messages: check if current user has seen it
                    $myStatus = $message->statuses->where('user_id', $userId)->first();
                    $message->status = $myStatus ? $myStatus->status : 'sent';
                }

                $message->deleted = $isDeleted;

                // Hide attachments and story preview for deleted messages.
                if ($isDeleted) {
                    $message->setRelation('attachments', collect());
                    $message->story_id = null;
                }

                // Add story media URL for story replies
                if (!$isDeleted && $message->story) {
                    $message->story_media_url = "/api/stories/{$message->story_id}/media";
                    $message->story_media_type = $message->story->media_type;
                    $message->story_owner = $message->story->user?->name ?? 'Unknown';
                    $message->story_expired = $message->story->expires_at->isPast();
                }

                // Remove statuses relation from response to keep it clean
                unset($message->statuses);
                return $message;
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
            ]);

            $user = auth()->user();

            // Verify user is a member of this conversation
            $memberRecord = ConversationMember::where('conversation_id', $conversationId)
                ->where('user_id', $user->id)
                ->first();

            if (!$memberRecord) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            // Restore this conversation for sender if they had deleted it locally.
            if ($memberRecord->deleted_at) {
                $memberRecord->deleted_at = null;
                $memberRecord->save();
            }

            $message = Message::create([
                'conversation_id' => $conversationId,
                'user_id' => $user->id,
                'content' => $validated['content'],
            ]);

            if (!empty($validated['media_id'])) {
                MediaAttachment::where('id', $validated['media_id'])
                    ->whereNull('message_id')
                    ->update(['message_id' => $message->id]);
            }

            $message->load(['user:id,name,avatar_url', 'reactions', 'attachments', 'statuses']);

            if ($message->user_id == $user->id) {
                $message->status = 'sent';
            }

            unset($message->statuses);

            // Emit WebSocket event (will implement later)
            // broadcast(new MessageSent($message));

            $participantIds = ConversationMember::where('conversation_id', $conversationId)
                ->pluck('user_id')
                ->all();

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
}
