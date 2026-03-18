<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Friend extends BaseModel
{
    protected $fillable = ['user_id', 'friend_id', 'status'];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function friend(): BelongsTo
    {
        return $this->belongsTo(User::class, 'friend_id');
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeAccepted($query)
    {
        return $query->where('status', 'accepted');
    }
}
