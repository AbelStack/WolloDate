<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\Follow;
use App\Models\Post;
use App\Models\Story;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MessageShareTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_send_a_structured_story_share_message(): void
    {
        $sender = $this->createUser('sender', 'sender@example.com');
        $storyOwner = $this->createUser('storyowner', 'storyowner@example.com');

        Follow::create([
            'follower_id' => $sender->id,
            'following_id' => $storyOwner->id,
            'status' => 'accepted',
        ]);

        $conversation = $this->createConversation($sender, [$storyOwner]);

        $story = Story::create([
            'user_id' => $storyOwner->id,
            'media_path' => 'stories/shared-story.jpg',
            'media_type' => 'image',
            'caption' => 'Shared story caption',
            'expires_at' => now()->addDay(),
        ]);

        Sanctum::actingAs($sender);

        $this->postJson("/api/conversations/{$conversation->id}/messages", [
            'content' => '[Shared story]',
            'story_id' => $story->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.story_id', $story->id)
            ->assertJsonPath('data.story_context', 'shared')
            ->assertJsonPath('data.story_caption', 'Shared story caption')
            ->assertJsonPath('data.story_owner', 'Storyowner');
    }

    public function test_user_can_send_a_structured_post_share_message(): void
    {
        $sender = $this->createUser('sender', 'sender@example.com');
        $postOwner = $this->createUser('postowner', 'postowner@example.com');

        $conversation = $this->createConversation($sender, [$postOwner]);

        $post = Post::create([
            'user_id' => $postOwner->id,
            'caption' => 'Shared post caption',
            'image_url' => 'posts/shared-post.jpg',
        ]);

        Sanctum::actingAs($sender);

        $this->postJson("/api/conversations/{$conversation->id}/messages", [
            'content' => '[Shared post]',
            'post_id' => $post->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.post_id', $post->id)
            ->assertJsonPath('data.post_context', 'shared')
            ->assertJsonPath('data.post_caption', 'Shared post caption')
            ->assertJsonPath('data.post_owner_username', 'postowner');
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
