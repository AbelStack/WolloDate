<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PinnedMessage extends BaseModel
{
    protected $table = 'pinned_messages';
    protected $fillable = ['message_id', 'conversation_id', 'pinned_by_id'];

    // Relationships
    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function pinnedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pinned_by_id');
    }
}
