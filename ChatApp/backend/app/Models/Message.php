<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends BaseModel
{
    protected $fillable = ['conversation_id', 'user_id', 'content', 'edited_at', 'story_id', 'post_id'];

    protected $casts = [
        'edited_at' => 'datetime',
    ];

    // Relationships
    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function story(): BelongsTo
    {
        return $this->belongsTo(Story::class);
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(Post::class);
    }

    public function statuses(): HasMany
    {
        return $this->hasMany(MessageStatus::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(MediaAttachment::class);
    }

    public function threads(): HasMany
    {
        return $this->hasMany(MessageThread::class, 'parent_message_id');
    }

    public function starredBy(): HasMany
    {
        return $this->hasMany(StarredMessage::class);
    }

    public function pinnedIn(): HasMany
    {
        return $this->hasMany(PinnedMessage::class);
    }

    // Scopes
    public function scopeForConversation($query, $conversationId)
    {
        return $query->where('conversation_id', $conversationId);
    }
}
