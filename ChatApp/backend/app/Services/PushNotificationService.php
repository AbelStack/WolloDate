<?php

namespace App\Services;

use App\Models\PushSubscription;
use App\Models\User;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification;

class PushNotificationService
{
    protected $messaging;

    public function __construct()
    {
        try {
            $credentialsPath = config('firebase.credentials');
            
            if (!file_exists($credentialsPath)) {
                \Log::warning('Firebase credentials file not found: ' . $credentialsPath);
                $this->messaging = null;
                return;
            }

            $factory = (new Factory)->withServiceAccount($credentialsPath);
            $this->messaging = $factory->createMessaging();
        } catch (\Exception $e) {
            \Log::error('Failed to initialize Firebase messaging: ' . $e->getMessage());
            $this->messaging = null;
        }
    }

    /**
     * Send notification to a specific user
     */
    public function sendToUser(User $user, string $title, string $body, array $data = [])
    {
        if (!$this->messaging) {
            \Log::warning('Firebase messaging not initialized');
            return false;
        }

        $subscriptions = PushSubscription::where('user_id', $user->id)->get();

        if ($subscriptions->isEmpty()) {
            \Log::info('No push subscriptions found for user: ' . $user->id);
            return false;
        }

        $successCount = 0;
        $failedTokens = [];

        foreach ($subscriptions as $subscription) {
            try {
                $message = CloudMessage::fromArray([
                    'token' => $subscription->token,
                    'notification' => [
                        'title' => $title,
                        'body' => $body,
                        'icon' => config('app.frontend_url') . '/logo.png',
                    ],
                    'data' => array_merge($data, [
                        'messageId' => $data['messageId'] ?? uniqid('msg_', true),
                    ]),
                    'webpush' => [
                        'notification' => [
                            'icon' => config('app.frontend_url') . '/logo.png',
                            'badge' => config('app.frontend_url') . '/logo.png',
                            'tag' => $data['messageId'] ?? $data['type'] ?? 'notification',
                        ],
                    ],
                ]);

                $this->messaging->send($message);
                $successCount++;
            } catch (\Exception $e) {
                \Log::error('Failed to send notification to token: ' . $subscription->token . ' - ' . $e->getMessage());
                
                // If token is invalid, mark for deletion
                if (str_contains($e->getMessage(), 'not-found') || 
                    str_contains($e->getMessage(), 'invalid-registration-token')) {
                    $failedTokens[] = $subscription->id;
                }
            }
        }

        // Clean up invalid tokens
        if (!empty($failedTokens)) {
            PushSubscription::whereIn('id', $failedTokens)->delete();
            \Log::info('Deleted ' . count($failedTokens) . ' invalid push tokens');
        }

        return $successCount > 0;
    }

    /**
     * Send notification to multiple users
     */
    public function sendToUsers(array $userIds, string $title, string $body, array $data = [])
    {
        if (!$this->messaging) {
            \Log::warning('Firebase messaging not initialized');
            return false;
        }

        $tokens = PushSubscription::whereIn('user_id', $userIds)
            ->pluck('token')
            ->toArray();

        if (empty($tokens)) {
            \Log::info('No push subscriptions found for users');
            return false;
        }

        try {
            $message = CloudMessage::new()
                ->withNotification(Notification::create($title, $body))
                ->withData($data);

            $this->messaging->sendMulticast($message, $tokens);
            return true;
        } catch (\Exception $e) {
            \Log::error('Failed to send multicast notification: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Send new message notification
     */
    public function sendMessageNotification(User $recipient, User $sender, string $messagePreview, int $conversationId, int $messageId = null)
    {
        $title = $sender->name;
        $body = $messagePreview;
        $data = [
            'type' => 'message',
            'conversationId' => (string) $conversationId,
            'senderId' => (string) $sender->id,
            'senderName' => $sender->name,
            'senderAvatar' => $sender->avatar_url ?? '',
            'messageId' => $messageId ? (string) $messageId : uniqid('msg_', true),
        ];

        return $this->sendToUser($recipient, $title, $body, $data);
    }

    /**
     * Send post like notification
     */
    public function sendLikeNotification(User $postOwner, User $liker, int $postId)
    {
        $title = 'New Like';
        $body = $liker->name . ' liked your post';
        $data = [
            'type' => 'like',
            'postId' => (string) $postId,
            'likerId' => (string) $liker->id,
            'likerName' => $liker->name,
        ];

        return $this->sendToUser($postOwner, $title, $body, $data);
    }

    /**
     * Send comment notification
     */
    public function sendCommentNotification(User $postOwner, User $commenter, string $commentText, int $postId)
    {
        $title = 'New Comment';
        $body = $commenter->name . ': ' . $commentText;
        $data = [
            'type' => 'comment',
            'postId' => (string) $postId,
            'commenterId' => (string) $commenter->id,
            'commenterName' => $commenter->name,
        ];

        return $this->sendToUser($postOwner, $title, $body, $data);
    }

    /**
     * Send follow notification
     */
    public function sendFollowNotification(User $followedUser, User $follower)
    {
        $title = 'New Follower';
        $body = $follower->name . ' started following you';
        $data = [
            'type' => 'follow',
            'userId' => (string) $follower->id,
            'userName' => $follower->name,
            'userAvatar' => $follower->avatar_url ?? '',
        ];

        return $this->sendToUser($followedUser, $title, $body, $data);
    }
}
