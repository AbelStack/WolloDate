<?php

namespace App\Support;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ActiveUserCapacity
{
    private const DEFAULT_MAX_USERS = 50;
    private const DEFAULT_TTL_SECONDS = 120;
    private const MYSQL_LOCK_WAIT_SECONDS = 2;
    private const MYSQL_LOCK_NAME = 'active_user_capacity_lock';

    public function maxUsers(): int
    {
        return (int) env('ACTIVE_USER_LIMIT', self::DEFAULT_MAX_USERS);
    }

    public function isAtCapacityForUser(int|string $userId): bool
    {
        try {
            return $this->withCapacityLock(function () use ($userId) {
                $this->cleanupExpired();

                if ($this->isUserActive($userId)) {
                    return false;
                }

                return $this->getActiveCount() >= $this->maxUsers();
            });
        } catch (\Throwable $e) {
            Log::warning('Active user capacity check failed. Falling back to allow login.', [
                'error' => $e->getMessage(),
            ]);

            // Fail closed so system overload is prevented when capacity checks fail.
            return true;
        }
    }

    public function markActive(int|string $userId): void
    {
        try {
            User::query()
                ->whereKey($userId)
                ->update([
                    'is_online' => true,
                    'last_seen' => Carbon::now(),
                ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to mark user as active in database.', [
                'user_id' => (string) $userId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function markInactive(int|string $userId): void
    {
        try {
            User::query()
                ->whereKey($userId)
                ->update([
                    'is_online' => false,
                    'last_seen' => Carbon::now(),
                ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to mark user as inactive in database.', [
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
        return (int) User::query()
            ->where('is_online', true)
            ->where('last_seen', '>=', $this->activityCutoff())
            ->count();
    }

    private function isUserActive(int|string $userId): bool
    {
        return User::query()
            ->whereKey($userId)
            ->where('is_online', true)
            ->where('last_seen', '>=', $this->activityCutoff())
            ->exists();
    }

    private function cleanupExpired(): void
    {
        User::query()
            ->where('is_online', true)
            ->where(function ($query) {
                $query
                    ->whereNull('last_seen')
                    ->orWhere('last_seen', '<', $this->activityCutoff());
            })
            ->update(['is_online' => false]);
    }

    private function activityCutoff(): Carbon
    {
        return Carbon::now()->subSeconds($this->ttlSeconds());
    }

    private function ttlSeconds(): int
    {
        return (int) env('ACTIVE_USER_TTL_SECONDS', self::DEFAULT_TTL_SECONDS);
    }

    private function withCapacityLock(callable $callback): bool
    {
        $driver = DB::connection()->getDriverName();

        if ($driver !== 'mysql') {
            return (bool) $callback();
        }

        $lock = DB::selectOne('SELECT GET_LOCK(?, ?) AS acquired', [
            self::MYSQL_LOCK_NAME,
            self::MYSQL_LOCK_WAIT_SECONDS,
        ]);

        if (!isset($lock->acquired) || (int) $lock->acquired !== 1) {
            throw new \RuntimeException('Unable to acquire active user capacity lock.');
        }

        try {
            return (bool) $callback();
        } finally {
            DB::selectOne('SELECT RELEASE_LOCK(?) AS released', [self::MYSQL_LOCK_NAME]);
        }
    }

}
