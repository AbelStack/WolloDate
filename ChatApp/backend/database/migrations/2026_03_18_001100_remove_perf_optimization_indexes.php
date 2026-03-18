<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop indexes that were introduced during the performance optimization pass.
        $this->dropIndexIfExists('users', 'users_visibility_filter_idx');
        $this->dropIndexIfExists('users', 'users_online_last_seen_idx');
        $this->dropIndexIfExists('message_statuses', 'msg_status_user_status_msg_idx');
        $this->dropIndexIfExists('conversation_members', 'cm_user_conv_deleted_idx');
        $this->dropIndexIfExists('messages', 'msg_conv_user_created_idx');
        $this->dropIndexIfExists('messages', 'msg_conv_created_id_idx');
        $this->dropIndexIfExists('conversations', 'conv_type_updated_idx');
        $this->dropIndexIfExists('conversations', 'conv_updated_id_idx');

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS msg_status_seen_user_message_idx');
            DB::statement('DROP INDEX IF EXISTS msg_conv_user_created_desc_idx');
            DB::statement('DROP INDEX IF EXISTS msg_conv_created_desc_idx');
            DB::statement('DROP INDEX IF EXISTS conv_updated_id_desc_idx');
            DB::statement('DROP INDEX IF EXISTS cm_user_deleted_conv_desc_idx');
        }
    }

    public function down(): void
    {
        // Intentionally left empty to keep rollback simple and avoid re-introducing removed optimization indexes.
    }

    private function dropIndexIfExists(string $tableName, string $indexName): void
    {
        if (!Schema::hasTable($tableName)) {
            return;
        }

        try {
            Schema::table($tableName, function (Blueprint $table) use ($indexName) {
                $table->dropIndex($indexName);
            });
        } catch (\Throwable $e) {
            // Ignore missing-index errors so migration remains idempotent across environments.
        }
    }
};
