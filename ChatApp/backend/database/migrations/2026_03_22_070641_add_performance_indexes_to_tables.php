<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * These indexes significantly improve query performance for:
     * - Feed loading (posts by date)
     * - User search (by username)
     * - Online users display (by online status and last seen)
     */
    public function up(): void
    {
        // Add index for posts ordered by creation date (for feed loading)
        Schema::table('posts', function (Blueprint $table) {
            $table->index('created_at', 'idx_posts_created_at');
        });

        // Add index for username lookups (for search and @mentions)
        Schema::table('users', function (Blueprint $table) {
            $table->index('username', 'idx_users_username');
            $table->index(['is_online', 'last_seen'], 'idx_users_is_online_last_seen');
        });

        // Add index for comments by post (for faster comment loading)
        Schema::table('comments', function (Blueprint $table) {
            $table->index(['post_id', 'created_at'], 'idx_comments_post_created');
        });

        // Add index for stories by user and creation date
        if (Schema::hasTable('stories')) {
            Schema::table('stories', function (Blueprint $table) {
                $table->index(['user_id', 'created_at'], 'idx_stories_user_created');
            });
        }

        // Add index for notifications by user and read status
        if (Schema::hasTable('user_notifications')) {
            Schema::table('user_notifications', function (Blueprint $table) {
                $table->index(['user_id', 'is_read', 'created_at'], 'idx_notifications_user_read_created');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropIndex('idx_posts_created_at');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_username');
            $table->dropIndex('idx_users_is_online_last_seen');
        });

        Schema::table('comments', function (Blueprint $table) {
            $table->dropIndex('idx_comments_post_created');
        });

        if (Schema::hasTable('stories')) {
            Schema::table('stories', function (Blueprint $table) {
                $table->dropIndex('idx_stories_user_created');
            });
        }

        if (Schema::hasTable('user_notifications')) {
            Schema::table('user_notifications', function (Blueprint $table) {
                $table->dropIndex('idx_notifications_user_read_created');
            });
        }
    }
};
