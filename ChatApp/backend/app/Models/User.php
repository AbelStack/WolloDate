<?php

namespace App\Models;

use Illuminate\Auth\MustVerifyEmail;
use Illuminate\Contracts\Auth\MustVerifyEmail as MustVerifyEmailContract;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmailContract
{
    use HasApiTokens, Notifiable, MustVerifyEmail;

    protected $guarded = ['id'];

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_online' => 'boolean',
        'is_approved' => 'boolean',
        'is_private' => 'boolean',
        'approved_at' => 'datetime',
    ];

    // Relationships
    public function conversations(): BelongsToMany
    {
        return $this->belongsToMany(Conversation::class, 'conversation_members')->withTimestamps();
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function conversationMembers(): HasMany
    {
        return $this->hasMany(ConversationMember::class);
    }

    public function messageStatuses(): HasMany
    {
        return $this->hasMany(MessageStatus::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }

    public function starredMessages(): HasMany
    {
        return $this->hasMany(StarredMessage::class);
    }

    // Campus & Department
    public function campus(): BelongsTo
    {
        return $this->belongsTo(Campus::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function blockedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_blocks', 'user_id', 'blocked_user_id')->withTimestamps();
    }

    public function blockedByUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_blocks', 'blocked_user_id', 'user_id')->withTimestamps();
    }

    public function hasBlockedUser($user): bool
    {
        $userId = $user instanceof self ? $user->id : (int) $user;

        return $this->blockedUsers()->where('blocked_user_id', $userId)->exists();
    }

    public function isBlockedByUser($user): bool
    {
        $userId = $user instanceof self ? $user->id : (int) $user;

        return $this->blockedByUsers()->where('user_id', $userId)->exists();
    }

    public function hasBlockedRelationshipWith($user): bool
    {
        return $this->hasBlockedUser($user) || $this->isBlockedByUser($user);
    }

    public function friends(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'friends', 'user_id', 'friend_id')
            ->wherePivot('status', 'accepted')
            ->withPivot('status')
            ->withTimestamps();
    }

    public function friendRequests(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'friends', 'friend_id', 'user_id')
            ->wherePivot('status', 'pending')
            ->withPivot('status')
            ->withTimestamps();
    }

    public function sentFriendRequests(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'friends', 'user_id', 'friend_id')
            ->wherePivot('status', 'pending')
            ->withPivot('status')
            ->withTimestamps();
    }

    // Follow System
    public function followers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'follows', 'following_id', 'follower_id')
            ->wherePivot('status', 'accepted')
            ->withPivot('status')
            ->withTimestamps();
    }

    public function following(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'follows', 'follower_id', 'following_id')
            ->wherePivot('status', 'accepted')
            ->withPivot('status')
            ->withTimestamps();
    }

    public function pendingFollowRequests(): HasMany
    {
        return $this->hasMany(Follow::class, 'following_id')->where('status', 'pending');
    }

    public function sentFollowRequests(): HasMany
    {
        return $this->hasMany(Follow::class, 'follower_id')->where('status', 'pending');
    }

    // Posts
    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    public function likedPosts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, 'post_likes')->withTimestamps();
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }

    // Stories
    public function stories(): HasMany
    {
        return $this->hasMany(Story::class);
    }

    public function activeStories(): HasMany
    {
        return $this->hasMany(Story::class)->where('expires_at', '>', now());
    }

    public function storyViews(): HasMany
    {
        return $this->hasMany(StoryView::class, 'viewer_id');
    }

    // Helpers
    public function isFollowing(User $user): bool
    {
        return $this->following()->where('following_id', $user->id)->exists();
    }

    public function hasPendingFollowRequest(User $user): bool
    {
        return $this->sentFollowRequests()->where('following_id', $user->id)->exists();
    }

    public function canViewProfile(User $user): bool
    {
        if ($this->id === $user->id) return true;
        if (!$user->is_private) return true;
        return $this->isFollowing($user);
    }
}
