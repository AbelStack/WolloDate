<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Campus extends Model
{
    protected $fillable = ['name', 'location'];

    public function departments(): HasMany
    {
        return $this->hasMany(Department::class);
    }
}
