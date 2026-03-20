<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BlockedMessagingTest extends TestCase
{
    use RefreshDatabase;

    public function test_blocked_user_cannot_send_messages_in_private_chat(): void
    {
        $blocker = $this->createUser('blocker', 'blocker@example.com');
        $blockedUser = $this->createUser('blocked', 'blocked@example.com');
        $conversation = $this->createConversation($blocker, [$blockedUser]);

        UserBlock::create([
            'user_id' => $blocker->id,
            'blocked_user_id' => $blockedUser->id,
        ]);

        Sanctum::actingAs($blockedUser);

        $this->postJson("/api/conversations/{$conversation->id}/messages", [
            'content' => 'You should not receive this.',
        ])
            ->assertForbidden()
            ->assertJson([
                'message' => 'You cannot message this user because one of you has blocked the other.',
            ]);

        $this->assertDatabaseMissing('messages', [
            'conversation_id' => $conversation->id,
            'content' => 'You should not receive this.',
        ]);
    }

    public function test_private_chat_cannot_be_created_when_users_have_blocked_each_other(): void
    {
        $currentUser = $this->createUser('sender', 'sender@example.com');
        $targetUser = $this->createUser('target', 'target@example.com');

        UserBlock::create([
            'user_id' => $targetUser->id,
            'blocked_user_id' => $currentUser->id,
        ]);

        Sanctum::actingAs($currentUser);

        $this->postJson('/api/conversations', [
            'type' => 'private',
            'user_ids' => [$targetUser->id],
        ])
            ->assertForbidden()
            ->assertJson([
                'message' => 'You cannot start a chat because one of you has blocked the other.',
            ]);

        $this->assertDatabaseCount('conversations', 0);
    }

    private function createConversation(User $creator, array $otherUsers): Conversation
    {
        $conversation = Conversation::create([
            'type' => 'private',
            'created_by_id' => $creator->id,
        ]);

        ConversationMember::create([
            'conversation_id' => $conversation->id,
            'user_id' => $creator->id,
        ]);

        foreach ($otherUsers as $user) {
            ConversationMember::create([
                'conversation_id' => $conversation->id,
                'user_id' => $user->id,
            ]);
        }

        return $conversation;
    }

    private function createUser(string $username, string $email): User
    {
        return User::create([
            'name' => ucfirst($username),
            'username' => $username,
            'email' => $email,
            'email_verified_at' => now(),
            'password' => Hash::make('password'),
            'is_approved' => true,
            'is_private' => false,
            'is_banned' => false,
            'role' => 'user',
        ]);
    }
}
