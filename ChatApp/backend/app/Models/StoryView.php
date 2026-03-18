<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoryView extends BaseModel
{
    protected $fillable = [
        'story_id',
        'viewer_id',
        'viewed_at',
    ];

    protected $casts = [
        'viewed_at' => 'datetime',
    ];

    public $timestamps = false;

    /**
     * Get the story that was viewed.
     */
    public function story(): BelongsTo
    {
        return $this->belongsTo(Story::class);
    }

    /**
     * Get the user who viewed the story.
     */
    public function viewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'viewer_id');
    }
}
