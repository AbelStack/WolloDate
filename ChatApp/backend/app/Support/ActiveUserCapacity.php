<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

class ActiveUserCapacity
{
    private const DEFAULT_MAX_USERS = 60;
    private const DEFAULT_TTL_SECONDS = 120;
    private const DEFAULT_REDIS_CONNECTION = 'default';
    private const DEFAULT_ACTIVE_USERS_KEY = 'chat:presence:active_users';

    public function maxUsers(): int
    {
        return (int) env('ACTIVE_USER_LIMIT', self::DEFAULT_MAX_USERS);
    }

    public function isAtCapacityForUser(int|string $userId): bool
    {
        try {
            $this->cleanupExpired();

            if ($this->isUserActive($userId)) {
                return false;
            }

            return $this->getActiveCount() >= $this->maxUsers();
        } catch (\Throwable $e) {
            Log::warning('Active user capacity check failed. Falling back to allow login.', [
                'error' => $e->getMessage(),
            ]);

            // Fail open: authentication should stay available if Redis is down.
            return false;
        }
    }

    public function markActive(int|string $userId): void
    {
        try {
            $this->cleanupExpired();

            $this->redis()->zadd(
                $this->activeUsersKey(),
                $this->expiryTimestamp(),
                (string) $userId
            );
        } catch (\Throwable $e) {
            Log::warning('Failed to mark user as active in Redis.', [
                'user_id' => (string) $userId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function markInactive(int|string $userId): void
    {
        try {
            $this->redis()->zrem($this->activeUsersKey(), (string) $userId);
        } catch (\Throwable $e) {
            Log::warning('Failed to mark user as inactive in Redis.', [
                'user_id' => (string) $userId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function refreshHeartbeat(int|string $userId): void
    {
        $this->markActive($userId);
    }

    public function getActiveCount(): int
    {
        return (int) $this->redis()->zcard($this->activeUsersKey());
    }

    private function isUserActive(int|string $userId): bool
    {
        return $this->redis()->zscore($this->activeUsersKey(), (string) $userId) !== null;
    }

    private function cleanupExpired(): void
    {
        $this->redis()->zremrangebyscore($this->activeUsersKey(), '-inf', (string) time());
    }

    private function expiryTimestamp(): int
    {
        return time() + $this->ttlSeconds();
    }

    private function ttlSeconds(): int
    {
        return (int) env('ACTIVE_USER_TTL_SECONDS', self::DEFAULT_TTL_SECONDS);
    }

    private function redisConnectionName(): string
    {
        return (string) env('ACTIVE_USER_REDIS_CONNECTION', self::DEFAULT_REDIS_CONNECTION);
    }

    private function activeUsersKey(): string
    {
        return (string) env('ACTIVE_USER_REDIS_KEY', self::DEFAULT_ACTIVE_USERS_KEY);
    }

    private function redis()
    {
        return Redis::connection($this->redisConnectionName());
    }
}
