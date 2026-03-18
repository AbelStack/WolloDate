<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('stories', function (Blueprint $table) {
            $table->foreignId('repost_of_story_id')
                ->nullable()
                ->after('caption')
                ->constrained('stories')
                ->nullOnDelete();

            $table->foreignId('repost_from_user_id')
                ->nullable()
                ->after('repost_of_story_id')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('stories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('repost_from_user_id');
            $table->dropConstrainedForeignId('repost_of_story_id');
        });
    }
};
