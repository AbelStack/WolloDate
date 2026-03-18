<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageStatus extends BaseModel
{
    protected $table = 'message_statuses';
    protected $fillable = ['message_id', 'user_id', 'status'];

    // Table has only updated_at, no created_at column
    const CREATED_AT = null;

    protected $casts = [
        'updated_at' => 'datetime',
    ];

    // Relationships
    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // Scopes
    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }
}
