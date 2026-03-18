<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StarredMessage extends BaseModel
{
    protected $table = 'starred_messages';
    protected $fillable = ['message_id', 'user_id'];

    // Relationships
    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
