<?php

namespace App\Http\Controllers;

use App\Models\Message;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    /**
     * Search messages
     * GET /api/search?q=hello&user=5&from=2025-02-01&to=2025-02-28
     */
    public function search(Request $request)
    {
        try {
            $query = $request->query('q');
            $userId = $request->query('user');
            $from = $request->query('from');
            $to = $request->query('to');
            $conversationId = $request->query('conversation_id');
            $limit = min($request->query('limit', 50), 100);
            $currentUser = auth()->user();

            if (!$query) {
                return response()->json([
                    'message' => 'Search query required',
                ], 400);
            }

            if (strlen($query) < 2) {
                return response()->json([
                    'message' => 'Search query must be at least 2 characters',
                ], 400);
            }

            // Only search within conversations the current user belongs to
            $userConversationIds = \App\Models\ConversationMember::where('user_id', $currentUser->id)
                ->pluck('conversation_id');

            $messages = Message::where('content', 'like', "%{$query}%")
                ->whereIn('conversation_id', $userConversationIds);

            // Filter by user
            if ($userId) {
                $messages->where('user_id', $userId);
            }

            // Filter by conversation (must still be one the user belongs to)
            if ($conversationId) {
                $messages->where('conversation_id', $conversationId);
            }

            // Filter by date range
            if ($from) {
                $messages->whereDate('created_at', '>=', $from);
            }
            if ($to) {
                $messages->whereDate('created_at', '<=', $to);
            }

            $results = $messages->with(['user:id,name,avatar_url', 'conversation:id,name,type'])
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get();

            return response()->json([
                'count' => $results->count(),
                'results' => $results,
                'query' => $query,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Search failed',
            ], 500);
        }
    }
}
