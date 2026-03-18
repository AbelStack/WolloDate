<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoryLike extends BaseModel
{
    protected $fillable = [
        'story_id',
        'user_id',
    ];

    protected $casts = [
        'liked_at' => 'datetime',
    ];

    public $timestamps = false;

    /**
     * Get the story that was liked.
     */
    public function story(): BelongsTo
    {
        return $this->belongsTo(Story::class);
    }

    /**
     * Get the user who liked the story.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
