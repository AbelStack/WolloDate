<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageThread extends BaseModel
{
    protected $table = 'message_threads';
    protected $fillable = ['parent_message_id', 'message_id'];

    public $timestamps = false;

    // Relationships
    public function parentMessage(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'parent_message_id');
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}
