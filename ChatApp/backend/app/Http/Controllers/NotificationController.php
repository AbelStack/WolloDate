<?php

namespace App\Http\Controllers;

use App\Models\UserNotification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Mark mention notifications as read for the current user.
     * POST /api/notifications/mentions/read
     */
    public function markMentionsRead(Request $request)
    {
        $count = UserNotification::where('recipient_id', $request->user()->id)
            ->whereIn('type', ['mention_post', 'mention_story', 'comment'])
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json([
            'message' => 'Activity notifications marked as read',
            'updated_count' => $count,
        ]);
    }
}
