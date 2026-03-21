<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Modify the enum to add 'comment' type
        DB::statement("ALTER TABLE user_notifications MODIFY COLUMN type ENUM('mention_post', 'mention_story', 'comment') NOT NULL");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Revert back to original enum values
        DB::statement("ALTER TABLE user_notifications MODIFY COLUMN type ENUM('mention_post', 'mention_story') NOT NULL");
    }
};
