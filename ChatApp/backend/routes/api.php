<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn() => response()->json(['status' => 'ok']));

// Public routes (no auth required)
Route::post('/auth/signup', [\App\Http\Controllers\AuthController::class, 'signup'])->middleware('throttle:5,1');
Route::post('/auth/login', [\App\Http\Controllers\AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/auth/password/forgot', [\App\Http\Controllers\AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/auth/password/reset', [\App\Http\Controllers\AuthController::class, 'resetPassword'])->middleware('throttle:10,1');
Route::post('/auth/email/resend', [\App\Http\Controllers\AuthController::class, 'resendVerification'])->middleware('throttle:5,1');
Route::get('/auth/email/verify/{id}/{hash}', [\App\Http\Controllers\AuthController::class, 'verifyEmail'])
    ->whereNumber('id')
    ->name('auth.verification.verify');
Route::get('/campuses', [\App\Http\Controllers\CampusController::class, 'index']);
// Story media is accessed directly via <img>/<video> and validates token in controller.
Route::get('/stories/{storyId}/media', [\App\Http\Controllers\StoryController::class, 'media']);

// Protected routes (auth required)
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [\App\Http\Controllers\AuthController::class, 'logout']);
    Route::get('/auth/me', [\App\Http\Controllers\AuthController::class, 'me']);
    Route::post('/auth/heartbeat', [\App\Http\Controllers\AuthController::class, 'heartbeat']);
    
    // Users
    Route::get('/users/search', [\App\Http\Controllers\UserController::class, 'search']);
    Route::get('/users/{id}', [\App\Http\Controllers\UserController::class, 'show']);
    Route::put('/users/{id}', [\App\Http\Controllers\UserController::class, 'update']);
    Route::put('/users/{id}/password', [\App\Http\Controllers\UserController::class, 'changePassword']);
    Route::post('/users/{id}/avatar', [\App\Http\Controllers\UserController::class, 'uploadAvatar']);
    Route::delete('/users/{id}/avatar', [\App\Http\Controllers\UserController::class, 'deleteAvatar']);
    Route::post('/users/{id}/block', [\App\Http\Controllers\UserController::class, 'blockUser']);
    Route::delete('/users/{id}/block', [\App\Http\Controllers\UserController::class, 'unblockUser']);
    Route::get('/users/{id}/blocked', [\App\Http\Controllers\UserController::class, 'getBlockedUsers']);
    
    // Conversations
    Route::get('/conversations', [\App\Http\Controllers\ConversationController::class, 'index']);
    Route::post('/conversations', [\App\Http\Controllers\ConversationController::class, 'store']);
    Route::get('/conversations/{id}', [\App\Http\Controllers\ConversationController::class, 'show']);
    Route::put('/conversations/{id}', [\App\Http\Controllers\ConversationController::class, 'update']);
    Route::delete('/conversations/{id}', [\App\Http\Controllers\ConversationController::class, 'destroy']);
    Route::post('/conversations/{id}/members', [\App\Http\Controllers\ConversationController::class, 'addMember']);
    Route::delete('/conversations/{id}/members/{userId}', [\App\Http\Controllers\ConversationController::class, 'removeMember']);
    Route::get('/conversations/{id}/pinned', [\App\Http\Controllers\PinnedMessageController::class, 'getPinned']);
    Route::post('/conversations/{id}/pinned/{msgId}', [\App\Http\Controllers\PinnedMessageController::class, 'pin']);
    Route::delete('/conversations/{id}/pinned/{msgId}', [\App\Http\Controllers\PinnedMessageController::class, 'unpin']);
    
    // Messages
    Route::get('/conversations/{id}/messages', [\App\Http\Controllers\MessageController::class, 'index']);
    Route::post('/conversations/{id}/messages', [\App\Http\Controllers\MessageController::class, 'store']);
    Route::delete('/conversations/{id}/messages', [\App\Http\Controllers\ConversationController::class, 'clearHistory']);
    Route::put('/conversations/{id}/mark-seen', [\App\Http\Controllers\MessageController::class, 'markConversationSeen']);
    Route::get('/messages/unread-count', [\App\Http\Controllers\MessageController::class, 'getUnreadCount']);
    Route::put('/messages/{id}', [\App\Http\Controllers\MessageController::class, 'update']);
    Route::delete('/messages/{id}', [\App\Http\Controllers\MessageController::class, 'destroy']);
    Route::post('/messages/{id}/reactions', [\App\Http\Controllers\MessageController::class, 'addReaction']);
    Route::delete('/messages/{id}/reactions/{emoji}', [\App\Http\Controllers\MessageController::class, 'removeReaction']);
    Route::post('/messages/{id}/star', [\App\Http\Controllers\MessageController::class, 'star']);
    Route::delete('/messages/{id}/star', [\App\Http\Controllers\MessageController::class, 'unstar']);
    Route::put('/messages/{id}/status/delivered', [\App\Http\Controllers\MessageController::class, 'markDelivered']);
    Route::put('/messages/{id}/status/seen', [\App\Http\Controllers\MessageController::class, 'markSeen']);
    Route::get('/messages/{id}/status', [\App\Http\Controllers\MessageController::class, 'getStatus']);
    
    // Search
    Route::get('/search', [\App\Http\Controllers\SearchController::class, 'search']);
    
    // Media
    Route::post('/upload', [\App\Http\Controllers\MediaController::class, 'upload']);
    Route::get('/media/{id}', [\App\Http\Controllers\MediaController::class, 'show']);
    
    // Friends
    Route::get('/friends/suggestions', [\App\Http\Controllers\FriendController::class, 'suggestions']);
    Route::get('/friends', [\App\Http\Controllers\FriendController::class, 'getList']);
    Route::post('/friends/request', [\App\Http\Controllers\FriendController::class, 'sendRequest']);
    Route::get('/friends/requests', [\App\Http\Controllers\FriendController::class, 'getPendingRequests']);
    Route::put('/friends/requests/{id}', [\App\Http\Controllers\FriendController::class, 'respondToRequest']);
    Route::delete('/friends/{id}', [\App\Http\Controllers\FriendController::class, 'removeFriend']);

    // Follow System
    Route::post('/follows/{userId}', [\App\Http\Controllers\FollowController::class, 'follow']);
    Route::delete('/follows/{userId}', [\App\Http\Controllers\FollowController::class, 'unfollow']);
    Route::get('/follows/requests', [\App\Http\Controllers\FollowController::class, 'getRequests']);
    Route::get('/follows/activity', [\App\Http\Controllers\FollowController::class, 'getActivity']);
    Route::post('/notifications/mentions/read', [\App\Http\Controllers\NotificationController::class, 'markMentionsRead']);
    Route::put('/follows/requests/{followId}', [\App\Http\Controllers\FollowController::class, 'respondToRequest']);
    Route::delete('/follows/followers/{userId}', [\App\Http\Controllers\FollowController::class, 'removeFollower']);
    Route::get('/users/{userId}/followers', [\App\Http\Controllers\FollowController::class, 'getFollowers']);
    Route::get('/users/{userId}/following', [\App\Http\Controllers\FollowController::class, 'getFollowing']);
    
    // Posts & Feed
    Route::get('/feed', [\App\Http\Controllers\PostController::class, 'feed']);
    Route::get('/users/{userId}/posts', [\App\Http\Controllers\PostController::class, 'userPosts']);
    Route::post('/posts', [\App\Http\Controllers\PostController::class, 'store']);
    Route::get('/posts/{postId}', [\App\Http\Controllers\PostController::class, 'show']);
    Route::put('/posts/{postId}', [\App\Http\Controllers\PostController::class, 'update']);
    Route::delete('/posts/{postId}', [\App\Http\Controllers\PostController::class, 'destroy']);
    Route::post('/posts/{postId}/like', [\App\Http\Controllers\PostController::class, 'like']);
    Route::delete('/posts/{postId}/like', [\App\Http\Controllers\PostController::class, 'unlike']);
    Route::post('/posts/{postId}/share', [\App\Http\Controllers\PostController::class, 'share']);
    
    // Comments
    Route::get('/posts/{postId}/comments', [\App\Http\Controllers\CommentController::class, 'index']);
    Route::post('/posts/{postId}/comments', [\App\Http\Controllers\CommentController::class, 'store']);
    Route::put('/comments/{commentId}', [\App\Http\Controllers\CommentController::class, 'update']);
    Route::delete('/comments/{commentId}', [\App\Http\Controllers\CommentController::class, 'destroy']);
    Route::post('/comments/{commentId}/like', [\App\Http\Controllers\CommentController::class, 'like']);
    Route::delete('/comments/{commentId}/like', [\App\Http\Controllers\CommentController::class, 'unlike']);
    Route::get('/comments/{commentId}/replies', [\App\Http\Controllers\CommentController::class, 'getReplies']);
    
    // Stories
    Route::get('/stories', [\App\Http\Controllers\StoryController::class, 'index']);
    Route::post('/stories', [\App\Http\Controllers\StoryController::class, 'store']);
    Route::get('/stories/{storyId}', [\App\Http\Controllers\StoryController::class, 'show']);
    Route::post('/stories/{storyId}/view', [\App\Http\Controllers\StoryController::class, 'view']);
    Route::post('/stories/{storyId}/like', [\App\Http\Controllers\StoryController::class, 'like']);
    Route::delete('/stories/{storyId}/like', [\App\Http\Controllers\StoryController::class, 'unlike']);
    Route::post('/stories/{storyId}/repost', [\App\Http\Controllers\StoryController::class, 'repost']);
    Route::post('/stories/{storyId}/reply', [\App\Http\Controllers\StoryController::class, 'reply']);
    Route::get('/stories/{storyId}/viewers', [\App\Http\Controllers\StoryController::class, 'viewers']);
    Route::put('/stories/{storyId}', [\App\Http\Controllers\StoryController::class, 'update']);
    Route::delete('/stories/{storyId}', [\App\Http\Controllers\StoryController::class, 'destroy']);
    Route::get('/users/{userId}/stories', [\App\Http\Controllers\StoryController::class, 'userStories']);
    
    // Reports (user submitting reports)
    Route::post('/reports', [\App\Http\Controllers\ReportController::class, 'store']);
    
    // Push Notifications
    Route::get('/push-subscriptions', [\App\Http\Controllers\PushSubscriptionController::class, 'index']);
    Route::post('/push-subscriptions', [\App\Http\Controllers\PushSubscriptionController::class, 'store']);
    Route::delete('/push-subscriptions', [\App\Http\Controllers\PushSubscriptionController::class, 'destroy']);
    Route::post('/push-subscriptions/test', [\App\Http\Controllers\PushSubscriptionController::class, 'test']);
    Route::post('/push-subscriptions/cleanup', [\App\Http\Controllers\PushSubscriptionController::class, 'cleanup']);
});

// Admin Auth (no auth required)
Route::post('/admin/auth/login', [\App\Http\Controllers\AdminAuthController::class, 'login'])->middleware('throttle:10,1');

// Admin Protected Routes (requires admin token)
Route::middleware(['auth:sanctum', 'abilities:admin'])->prefix('admin')->group(function () {
    // Admin Auth
    Route::post('/auth/logout', [\App\Http\Controllers\AdminAuthController::class, 'logout']);
    Route::get('/auth/me', [\App\Http\Controllers\AdminAuthController::class, 'me']);
    
    // Dashboard
    Route::get('/stats', [\App\Http\Controllers\AdminController::class, 'getStats']);
    
    // User Management
    Route::get('/users/pending', [\App\Http\Controllers\AdminController::class, 'getPendingUsers']);
    Route::get('/users', [\App\Http\Controllers\AdminController::class, 'getUsers']);
    Route::put('/users/{userId}/approve', [\App\Http\Controllers\AdminController::class, 'approveUser']);
    Route::delete('/users/{userId}/reject', [\App\Http\Controllers\AdminController::class, 'rejectUser']);
    Route::put('/users/{userId}/ban', [\App\Http\Controllers\AdminController::class, 'banUser']);
    Route::put('/users/{userId}/unban', [\App\Http\Controllers\AdminController::class, 'unbanUser']);
    Route::delete('/users/{userId}', [\App\Http\Controllers\AdminController::class, 'deleteUser']);
    
    // Content Moderation
    Route::get('/posts', [\App\Http\Controllers\AdminController::class, 'getPosts']);
    Route::delete('/posts/{postId}', [\App\Http\Controllers\AdminController::class, 'deletePost']);
    Route::get('/stories', [\App\Http\Controllers\AdminController::class, 'getStories']);
    Route::delete('/stories/{storyId}', [\App\Http\Controllers\AdminController::class, 'deleteStory']);
    Route::delete('/comments/{commentId}', [\App\Http\Controllers\AdminController::class, 'deleteComment']);
    
    // Reports
    Route::get('/reports', [\App\Http\Controllers\AdminController::class, 'getReports']);
    Route::put('/reports/{reportId}', [\App\Http\Controllers\AdminController::class, 'reviewReport']);
});
