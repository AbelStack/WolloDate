<?php

namespace App\Http\Controllers;

use App\Models\PinnedMessage;
use App\Models\Message;
use App\Models\Conversation;
use Illuminate\Http\Request;

class PinnedMessageController extends Controller
{
    /**
     * Pin message
     * POST /api/conversations/{id}/pinned/{msgId}
     */
    public function pin($conversationId, $messageId)
    {
        try {
            $conversation = Conversation::find($conversationId);
            $message = Message::find($messageId);
            $user = auth()->user();

            if (!$conversation || !$message) {
                return response()->json([
                    'message' => 'Conversation or message not found',
                ], 404);
            }

            // Check if user is member of conversation
            $isMember = $conversation->members()->where('user_id', $user->id)->exists();
            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // Check if message is in this conversation
            if ($message->conversation_id != $conversationId) {
                return response()->json([
                    'message' => 'Message does not belong to this conversation',
                ], 400);
            }

            // Check if already pinned
            $alreadyPinned = PinnedMessage::where('message_id', $messageId)
                ->where('conversation_id', $conversationId)
                ->exists();

            if ($alreadyPinned) {
                return response()->json([
                    'message' => 'Message already pinned',
                ], 400);
            }

            // Check pin limit (max 5)
            $pinnedCount = PinnedMessage::where('conversation_id', $conversationId)->count();
            if ($pinnedCount >= 5) {
                return response()->json([
                    'message' => 'Maximum 5 pinned messages allowed per channel',
                ], 400);
            }

            PinnedMessage::create([
                'message_id' => $messageId,
                'conversation_id' => $conversationId,
                'pinned_by_id' => $user->id,
            ]);

            return response()->json([
                'message' => 'Message pinned',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to pin message',
            ], 500);
        }
    }

    /**
     * Unpin message
     * DELETE /api/conversations/{id}/pinned/{msgId}
     */
    public function unpin($conversationId, $messageId)
    {
        try {
            $conversation = Conversation::find($conversationId);
            $user = auth()->user();

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            // Check if user is member
            $isMember = $conversation->members()->where('user_id', $user->id)->exists();
            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            $deleted = PinnedMessage::where('message_id', $messageId)
                ->where('conversation_id', $conversationId)
                ->delete();

            if ($deleted === 0) {
                return response()->json([
                    'message' => 'Pinned message not found',
                ], 404);
            }

            return response()->json([
                'message' => 'Message unpinned',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to unpin message',
            ], 500);
        }
    }

    /**
     * Get pinned messages
     * GET /api/conversations/{id}/pinned
     */
    public function getPinned($conversationId)
    {
        try {
            $conversation = Conversation::find($conversationId);

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            // Check if user is member
            $isMember = $conversation->members()->where('user_id', auth()->id())->exists();
            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            $pinnedMessages = PinnedMessage::where('conversation_id', $conversationId)
                ->with(['message' => function($q) {
                    $q->with('user:id,name,avatar_url');
                }, 'pinnedBy:id,name'])
                ->orderByDesc('created_at')
                ->get();

            return response()->json([
                'count' => $pinnedMessages->count(),
                'pinnedMessages' => $pinnedMessages,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get pinned messages',
            ], 500);
        }
    }
}
