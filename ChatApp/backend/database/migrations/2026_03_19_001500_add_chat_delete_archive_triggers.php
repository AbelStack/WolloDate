<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_row_archives', function (Blueprint $table) {
            $table->id();
            $table->string('table_name', 64);
            $table->unsignedBigInteger('row_id');
            $table->json('payload');
            $table->timestamp('archived_at')->useCurrent();

            $table->index(['table_name', 'row_id']);
            $table->index('archived_at');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION archive_deleted_chat_row()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO chat_row_archives (table_name, row_id, payload, archived_at)
    VALUES (TG_TABLE_NAME, OLD.id, to_jsonb(OLD), NOW());
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
SQL);

            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_messages ON messages;");
            DB::unprepared("CREATE TRIGGER trg_archive_deleted_messages BEFORE DELETE ON messages FOR EACH ROW EXECUTE FUNCTION archive_deleted_chat_row();");

            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_media_attachments ON media_attachments;");
            DB::unprepared("CREATE TRIGGER trg_archive_deleted_media_attachments BEFORE DELETE ON media_attachments FOR EACH ROW EXECUTE FUNCTION archive_deleted_chat_row();");

            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_conversations ON conversations;");
            DB::unprepared("CREATE TRIGGER trg_archive_deleted_conversations BEFORE DELETE ON conversations FOR EACH ROW EXECUTE FUNCTION archive_deleted_chat_row();");

            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_conversation_members ON conversation_members;");
            DB::unprepared("CREATE TRIGGER trg_archive_deleted_conversation_members BEFORE DELETE ON conversation_members FOR EACH ROW EXECUTE FUNCTION archive_deleted_chat_row();");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_conversation_members ON conversation_members;");
            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_conversations ON conversations;");
            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_media_attachments ON media_attachments;");
            DB::unprepared("DROP TRIGGER IF EXISTS trg_archive_deleted_messages ON messages;");
            DB::unprepared("DROP FUNCTION IF EXISTS archive_deleted_chat_row();");
        }

        Schema::dropIfExists('chat_row_archives');
    }
};
