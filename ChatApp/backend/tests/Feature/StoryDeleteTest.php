<?php

namespace Tests\Feature;

use App\Models\Story;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StoryDeleteTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_delete_their_reposted_story_without_deleting_the_original(): void
    {
        Storage::fake('local');

        $sourceOwner = $this->createUser('owner', 'owner@example.com');
        $reposter = $this->createUser('reposter', 'reposter@example.com');

        $sourcePath = 'stories/source-story.jpg';
        $repostPath = 'stories/reposts/reposted-story.jpg';

        Storage::disk('local')->put($sourcePath, 'source');
        Storage::disk('local')->put($repostPath, 'repost');

        $sourceStory = Story::create([
            'user_id' => $sourceOwner->id,
            'media_path' => $sourcePath,
            'media_type' => 'image',
            'caption' => 'Original story',
            'expires_at' => now()->addDay(),
        ]);

        $repostStory = Story::create([
            'user_id' => $reposter->id,
            'media_path' => $repostPath,
            'media_type' => 'image',
            'caption' => 'Reposted story',
            'repost_of_story_id' => $sourceStory->id,
            'repost_from_user_id' => $sourceOwner->id,
            'expires_at' => now()->addDay(),
        ]);

        Sanctum::actingAs($reposter);

        $this->deleteJson("/api/stories/{$repostStory->id}")
            ->assertOk()
            ->assertJson(['message' => 'Story deleted']);

        $this->assertDatabaseHas('stories', ['id' => $sourceStory->id]);
        $this->assertDatabaseMissing('stories', ['id' => $repostStory->id]);
        Storage::disk('local')->assertExists($sourcePath);
        Storage::disk('local')->assertMissing($repostPath);
    }

    public function test_user_cannot_delete_someone_elses_original_story(): void
    {
        Storage::fake('local');

        $sourceOwner = $this->createUser('owner', 'owner@example.com');
        $reposter = $this->createUser('reposter', 'reposter@example.com');

        $sourcePath = 'stories/source-story.jpg';
        $repostPath = 'stories/reposts/reposted-story.jpg';

        Storage::disk('local')->put($sourcePath, 'source');
        Storage::disk('local')->put($repostPath, 'repost');

        $sourceStory = Story::create([
            'user_id' => $sourceOwner->id,
            'media_path' => $sourcePath,
            'media_type' => 'image',
            'caption' => 'Original story',
            'expires_at' => now()->addDay(),
        ]);

        $repostStory = Story::create([
            'user_id' => $reposter->id,
            'media_path' => $repostPath,
            'media_type' => 'image',
            'caption' => 'Reposted story',
            'repost_of_story_id' => $sourceStory->id,
            'repost_from_user_id' => $sourceOwner->id,
            'expires_at' => now()->addDay(),
        ]);

        Sanctum::actingAs($reposter);

        $this->deleteJson("/api/stories/{$sourceStory->id}")
            ->assertForbidden()
            ->assertJson(['message' => 'Unauthorized']);

        $this->assertDatabaseHas('stories', ['id' => $sourceStory->id]);
        $this->assertDatabaseHas('stories', ['id' => $repostStory->id]);
        Storage::disk('local')->assertExists($sourcePath);
        Storage::disk('local')->assertExists($repostPath);
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
