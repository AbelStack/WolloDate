<?php

namespace App\Services;

use Illuminate\Support\Facades\Redis;

class ActiveUserCapacity
{
    protected $key = 'active_users';
    protected $max = 50;
    protected $ttl = 120; // seconds

    public function isAtCapacityForUser($userId)
    {
        // If user is already in the set, allow
        if ($this->isActive($userId)) {
            return false;
        }
        // Otherwise, check if at capacity
        return $this->count() >= $this->max;
    }

    public function markActive($userId)
    {
        Redis::sadd($this->key, $userId);
        Redis::expire($this->key, $this->ttl);
    }

    public function remove($userId)
    {
        Redis::srem($this->key, $userId);
    }

    public function isActive($userId)
    {
        return Redis::sismember($this->key, $userId);
    }

    public function count()
    {
        return Redis::scard($this->key);
    }

    public function refreshHeartbeat($userId)
    {
        // For Redis, just mark as active again to refresh TTL
        $this->markActive($userId);
    }
}
