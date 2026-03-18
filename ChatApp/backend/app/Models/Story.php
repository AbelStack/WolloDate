<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Story extends BaseModel
{
    protected $fillable = [
        'user_id',
        'media_path',
        'media_type',
        'caption',
        'repost_of_story_id',
        'repost_from_user_id',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];

    /**
     * Get the user who created the story.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function repostedFromStory(): BelongsTo
    {
        return $this->belongsTo(Story::class, 'repost_of_story_id');
    }

    public function repostFromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'repost_from_user_id');
    }

    /**
     * Get the views for this story.
     */
    public function views(): HasMany
    {
        return $this->hasMany(StoryView::class);
    }

    /**
     * Get the likes for this story.
     */
    public function likes(): HasMany
    {
        return $this->hasMany(StoryLike::class);
    }

    /**
     * Check if the story has expired.
     */
    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    /**
     * Scope to get only active (non-expired) stories.
     */
    public function scopeActive($query)
    {
        return $query->where('expires_at', '>', now());
    }

    /**
     * Scope to get expired stories.
     */
    public function scopeExpired($query)
    {
        return $query->where('expires_at', '<=', now());
    }

    /**
     * Check if a user has viewed this story.
     */
    public function hasBeenViewedBy(int $userId): bool
    {
        return $this->views()->where('viewer_id', $userId)->exists();
    }

    /**
     * Get the view count for this story.
     */
    public function getViewCountAttribute(): int
    {
        return $this->views()->count();
    }

    /**
     * Check if a user has liked this story.
     */
    public function hasBeenLikedBy(int $userId): bool
    {
        return $this->likes()->where('user_id', $userId)->exists();
    }

    /**
     * Get the like count for this story.
     */
    public function getLikeCountAttribute(): int
    {
        return $this->likes()->count();
    }
}
