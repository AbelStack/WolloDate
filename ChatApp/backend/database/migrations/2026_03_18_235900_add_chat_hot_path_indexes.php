<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX IF NOT EXISTS cm_user_conv_deleted_idx ON conversation_members (user_id, conversation_id, deleted_at)');
            DB::statement('CREATE INDEX IF NOT EXISTS cm_conv_user_deleted_idx ON conversation_members (conversation_id, user_id, deleted_at)');

            DB::statement('CREATE INDEX IF NOT EXISTS msg_conv_created_user_idx ON messages (conversation_id, created_at DESC, user_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS msg_conv_user_created_idx ON messages (conversation_id, user_id, created_at DESC)');

            DB::statement('CREATE INDEX IF NOT EXISTS msg_status_msg_user_status_idx ON message_statuses (message_id, user_id, status)');
            DB::statement('CREATE INDEX IF NOT EXISTS msg_status_user_status_msg_idx ON message_statuses (user_id, status, message_id)');

            DB::statement('CREATE INDEX IF NOT EXISTS msg_reactions_message_user_idx ON message_reactions (message_id, user_id)');
            DB::statement('CREATE INDEX IF NOT EXISTS media_attachments_message_type_idx ON media_attachments (message_id, type)');
            return;
        }

        DB::statement('CREATE INDEX cm_user_conv_deleted_idx ON conversation_members (user_id, conversation_id, deleted_at)');
        DB::statement('CREATE INDEX cm_conv_user_deleted_idx ON conversation_members (conversation_id, user_id, deleted_at)');
        DB::statement('CREATE INDEX msg_conv_created_user_idx ON messages (conversation_id, created_at, user_id)');
        DB::statement('CREATE INDEX msg_conv_user_created_idx ON messages (conversation_id, user_id, created_at)');
        DB::statement('CREATE INDEX msg_status_msg_user_status_idx ON message_statuses (message_id, user_id, status)');
        DB::statement('CREATE INDEX msg_status_user_status_msg_idx ON message_statuses (user_id, status, message_id)');
        DB::statement('CREATE INDEX msg_reactions_message_user_idx ON message_reactions (message_id, user_id)');
        DB::statement('CREATE INDEX media_attachments_message_type_idx ON media_attachments (message_id, type)');
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS cm_user_conv_deleted_idx');
            DB::statement('DROP INDEX IF EXISTS cm_conv_user_deleted_idx');
            DB::statement('DROP INDEX IF EXISTS msg_conv_created_user_idx');
            DB::statement('DROP INDEX IF EXISTS msg_conv_user_created_idx');
            DB::statement('DROP INDEX IF EXISTS msg_status_msg_user_status_idx');
            DB::statement('DROP INDEX IF EXISTS msg_status_user_status_msg_idx');
            DB::statement('DROP INDEX IF EXISTS msg_reactions_message_user_idx');
            DB::statement('DROP INDEX IF EXISTS media_attachments_message_type_idx');
            return;
        }

        DB::statement('DROP INDEX cm_user_conv_deleted_idx ON conversation_members');
        DB::statement('DROP INDEX cm_conv_user_deleted_idx ON conversation_members');
        DB::statement('DROP INDEX msg_conv_created_user_idx ON messages');
        DB::statement('DROP INDEX msg_conv_user_created_idx ON messages');
        DB::statement('DROP INDEX msg_status_msg_user_status_idx ON message_statuses');
        DB::statement('DROP INDEX msg_status_user_status_msg_idx ON message_statuses');
        DB::statement('DROP INDEX msg_reactions_message_user_idx ON message_reactions');
        DB::statement('DROP INDEX media_attachments_message_type_idx ON media_attachments');
    }
};
