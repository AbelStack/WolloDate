<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    /**
     * Get all conversations for current user
     * GET /api/conversations
     */
    public function index(Request $request)
    {
        $user = auth()->user();
        $conversations = Conversation::query()
            ->join('conversation_members as cm', function ($join) use ($user) {
                $join->on('cm.conversation_id', '=', 'conversations.id')
                    ->where('cm.user_id', '=', $user->id);
            })
            ->where(function ($q) {
                $q->whereNull('cm.deleted_at')
                    ->orWhereExists(function ($exists) {
                        $exists->select(DB::raw(1))
                            ->from('messages as latest_visible_msg')
                            ->whereColumn('latest_visible_msg.conversation_id', 'conversations.id')
                            ->whereColumn('latest_visible_msg.created_at', '>', 'cm.deleted_at');
                    });
            })
            ->with([
                'members:id,name,username,avatar_url,is_online,is_approved',
                'latestMessage:messages.id,messages.conversation_id,messages.user_id,messages.content,messages.created_at,messages.edited_at',
                'latestMessage.user:id,name,username,avatar_url,is_approved',
            ])
            ->withCount([
                'messages as unread_count' => function ($subQuery) use ($user) {
                    $subQuery->where('messages.user_id', '!=', $user->id)
                        ->whereRaw(
                            "messages.created_at > COALESCE((SELECT cm2.deleted_at FROM conversation_members cm2 WHERE cm2.conversation_id = messages.conversation_id AND cm2.user_id = ? LIMIT 1), '1970-01-01 00:00:00')",
                            [$user->id]
                        )
                        ->whereNotExists(function ($statusQuery) use ($user) {
                            $statusQuery->select(DB::raw(1))
                                ->from('message_statuses')
                                ->whereColumn('message_statuses.message_id', 'messages.id')
                                ->where('message_statuses.user_id', $user->id)
                                ->where('message_statuses.status', 'seen');
                        });
                },
            ])
            ->orderByDesc('conversations.updated_at')
            ->orderByDesc('conversations.id')
            ->get();

        $payload = $conversations->map(function ($conv) {
            $conv->last_message = $conv->latestMessage;
            unset($conv->latestMessage);
            return $conv;
        })->values();

        return response()->json($payload);
    }

    /**
     * Create new conversation (1-to-1 or group)
     * POST /api/conversations
     * Body: { type: 'private'|'group', name?, user_ids[] }
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'type' => 'required|in:private,group',
                'name' => 'required_if:type,group|string|max:255',
                'user_ids' => 'required|array|min:1',
                'user_ids.*' => 'integer|exists:users,id',
            ]);

            $currentUser = auth()->user();
            $otherUserIds = collect($validated['user_ids'])
                ->map(fn ($userId) => (int) $userId)
                ->filter(fn ($userId) => $userId !== (int) $currentUser->id)
                ->unique()
                ->values()
                ->all();

            if ($validated['type'] === 'private') {
                if (count($otherUserIds) !== 1) {
                    return response()->json([
                        'message' => 'Private chats must include exactly one other user.',
                    ], 422);
                }

                if ($currentUser->hasBlockedRelationshipWith($otherUserIds[0])) {
                    return response()->json([
                        'message' => 'You cannot start a chat because one of you has blocked the other.',
                    ], 403);
                }
            }

            // Create conversation
            $conversation = Conversation::create([
                'type' => $validated['type'],
                'name' => $validated['name'] ?? null,
                'created_by_id' => $currentUser->id,
            ]);

            // Add current user as member
            $conversation->members()->attach($currentUser->id);

            // Add other members
            foreach ($otherUserIds as $userId) {
                if ($userId != $currentUser->id) {
                    $conversation->members()->attach($userId);
                }
            }

            $conversation->private_chat_blocked = false;

            self::flushConversationListCacheForUsers(array_merge([$currentUser->id], $validated['user_ids']));

            return response()->json([
                'message' => 'Conversation created successfully',
                'conversation' => $conversation,
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to create conversation',
            ], 500);
        }
    }

    /**
     * Get conversation details
     * GET /api/conversations/{id}
     */
    public function show($id)
    {
        try {
            $conversation = Conversation::with('members')->find($id);
            $currentUser = auth()->user();

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            // Check if user is member of conversation
            $memberRecord = ConversationMember::where('conversation_id', $id)
                ->where('user_id', $currentUser->id)
                ->first();

            $isMember = (bool) $memberRecord;
            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            if ($memberRecord->deleted_at) {
                $hasNewMessage = Message::where('conversation_id', $conversation->id)
                    ->where('created_at', '>', $memberRecord->deleted_at)
                    ->exists();

                if (!$hasNewMessage) {
                    return response()->json([
                        'message' => 'Conversation not found',
                    ], 404);
                }
            }

            $conversation->private_chat_blocked = false;

            if ($conversation->type === 'private') {
                $otherUser = $conversation->members->firstWhere('id', '!=', $currentUser->id);
                $conversation->private_chat_blocked = (bool) ($otherUser && $currentUser->hasBlockedRelationshipWith($otherUser));
            }

            return response()->json([
                'conversation' => $conversation,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get conversation',
            ], 500);
        }
    }

    /**
     * Update conversation (name, icon)
     * PUT /api/conversations/{id}
     * Body: { name, icon_url }
     */
    public function update(Request $request, $id)
    {
        try {
            $conversation = Conversation::find($id);

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            // Check if user is part of conversation
            $isMember = $conversation->members()->where('user_id', auth()->id())->exists();
            
            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // Validate input
            $validated = $request->validate([
                'name' => 'sometimes|string|max:255',
                'icon_url' => 'sometimes|string|max:500',
            ]);

            $conversation->update($validated);

            return response()->json([
                'message' => 'Conversation updated',
                'conversation' => $conversation,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update conversation',
            ], 500);
        }
    }

    /**
     * Delete/leave conversation
     * DELETE /api/conversations/{id}
     */
    public function destroy($id)
    {
        try {
            $conversation = Conversation::find($id);
            $user = auth()->user();

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            $memberRecord = ConversationMember::where('conversation_id', $conversation->id)
                ->where('user_id', $user->id)
                ->first();

            if (!$memberRecord) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // One-sided delete: hide existing history only for this member.
            $memberRecord->deleted_at = Carbon::now();
            $memberRecord->save();

            self::flushConversationListCacheForUsers([$user->id]);

            return response()->json([
                'message' => 'Chat deleted for your account only',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete conversation',
            ], 500);
        }
    }

    /**
     * Add member to group chat
     * POST /api/conversations/{id}/members
     * Body: { user_ids: [] }
     */
    public function addMember(Request $request, $id)
    {
        try {
            $conversation = Conversation::find($id);
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

            // Validate input
            $validated = $request->validate([
                'user_ids' => 'required|array',
                'user_ids.*' => 'integer|exists:users,id',
            ]);

            // Add members (avoid duplicates)
            foreach ($validated['user_ids'] as $userId) {
                $conversation->members()->syncWithoutDetaching([$userId]);
            }

            self::flushConversationListCacheForUsers($this->conversationParticipantIds($conversation->id));

            return response()->json([
                'message' => 'Members added successfully',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to add members',
            ], 500);
        }
    }

    /**
     * Remove member from group chat
     * DELETE /api/conversations/{id}/members/{userId}
     */
    public function removeMember($id, $userId)
    {
        try {
            $conversation = Conversation::find($id);
            $currentUser = auth()->user();

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            if ($conversation->type === 'private') {
                return response()->json([
                    'message' => 'Members cannot be removed from private chats',
                ], 400);
            }

            // Check if current user is member
            $isMember = $conversation->members()->where('user_id', $currentUser->id)->exists();
            
            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // Can only remove self or others if you're admin (creator)
            if ($userId != $currentUser->id && $conversation->created_by_id != $currentUser->id) {
                return response()->json([
                    'message' => 'Unauthorized - only admin can remove others',
                ], 403);
            }

            // Remove member
            $conversation->members()->detach($userId);

            self::flushConversationListCacheForUsers(array_unique([$currentUser->id, (int) $userId, ...$this->conversationParticipantIds($conversation->id)]));

            return response()->json([
                'message' => 'Member removed successfully',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to remove member',
            ], 500);
        }
    }

    /**
     * Clear conversation history for all members (soft clear)
     * DELETE /api/conversations/{id}/messages
     */
    public function clearHistory($id)
    {
        try {
            $conversation = Conversation::find($id);
            $currentUser = auth()->user();

            if (!$conversation) {
                return response()->json([
                    'message' => 'Conversation not found',
                ], 404);
            }

            $isMember = $conversation->members()->where('user_id', $currentUser->id)->exists();

            if (!$isMember) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            Message::where('conversation_id', $conversation->id)->update([
                'content' => '[Message deleted]',
                'story_id' => null,
                'post_id' => null,
                'edited_at' => now(),
            ]);

            self::flushConversationListCacheForUsers($this->conversationParticipantIds($conversation->id));

            return response()->json([
                'message' => 'Conversation history cleared',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to clear conversation history',
            ], 500);
        }
    }

    private function conversationParticipantIds(int $conversationId): array
    {
        return ConversationMember::where('conversation_id', $conversationId)
            ->pluck('user_id')
            ->map(fn($id) => (int) $id)
            ->all();
    }

    public static function flushConversationListCacheForUsers(array $userIds): void
    {
        // Conversation list caching was removed; keep this method as a no-op
        // to avoid touching existing call sites.
    }
}
