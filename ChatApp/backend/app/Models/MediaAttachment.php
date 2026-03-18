<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MediaAttachment extends BaseModel
{
    protected $table = 'media_attachments';
    protected $fillable = ['message_id', 'type', 'file_path', 'file_size', 'original_filename', 'mime_type'];

    // Relationships
    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    // Scopes
    public function scopeType($query, $type)
    {
        return $query->where('type', $type);
    }
}
