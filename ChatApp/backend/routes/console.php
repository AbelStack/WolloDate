<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

// Schedule story cleanup to run every hour
Schedule::command('stories:cleanup')->hourly();

Artisan::command('metrics:http-latency {--file= : Log file path} {--limit=0 : Optional number of latest lines to parse}', function () {
    $filePath = $this->option('file') ?: storage_path('logs/laravel.log');
    $limit = (int) $this->option('limit');

    if (!File::exists($filePath)) {
        $this->error("Log file not found: {$filePath}");
        return;
    }

    $targets = [
        '/api/conversations',
        '/api/conversations/*/messages',
        '/api/follows/activity',
        '/storage/*',
    ];

    $content = File::get($filePath);
    $lines = preg_split('/\r\n|\r|\n/', $content);
    if ($limit > 0 && count($lines) > $limit) {
        $lines = array_slice($lines, -$limit);
    }

    $metrics = [];
    $regex = '/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+([^\s]+)\s+\.+\s+~\s+([\d\.]+)(ms|s)/i';

    foreach ($lines as $line) {
        if (!preg_match($regex, $line, $m)) {
            continue;
        }

        $path = trim($m[1]);
        $value = (float) $m[2];
        $unit = strtolower($m[3]);
        $ms = $unit === 's' ? ($value * 1000.0) : $value;

        $normalizedPath = $path;
        if (preg_match('#^/api/conversations/\d+/messages$#', $path)) {
            $normalizedPath = '/api/conversations/*/messages';
        } elseif (preg_match('#^/storage/.+#', $path)) {
            $normalizedPath = '/storage/*';
        }

        if (!in_array($normalizedPath, $targets, true)) {
            continue;
        }

        $metrics[$normalizedPath][] = $ms;
    }

    if (empty($metrics)) {
        $this->warn('No matching latency entries were found.');
        return;
    }

    $rows = [];
    foreach ($targets as $target) {
        $samples = $metrics[$target] ?? [];
        if (empty($samples)) {
            $rows[] = [$target, 0, '-', '-', '-'];
            continue;
        }

        sort($samples);
        $count = count($samples);
        $p50 = $samples[(int) floor(0.50 * ($count - 1))];
        $p95 = $samples[(int) floor(0.95 * ($count - 1))];
        $avg = array_sum($samples) / $count;

        $rows[] = [
            $target,
            $count,
            number_format($p50, 2) . ' ms',
            number_format($p95, 2) . ' ms',
            number_format($avg, 2) . ' ms',
        ];
    }

    $this->table(['Endpoint', 'Samples', 'p50', 'p95', 'avg'], $rows);
    $this->comment('Tip: combine this with browser Network timings to separate server-time vs network-time.');
})->purpose('Report p50/p95 HTTP latency by endpoint from laravel.log');

Artisan::command('chat:restore-message {messageId : Deleted message id to restore}', function () {
    $messageId = (int) $this->argument('messageId');

    if ($messageId <= 0) {
        $this->error('messageId must be a positive integer.');
        return;
    }

    if (!DB::getSchemaBuilder()->hasTable('chat_row_archives')) {
        $this->error('chat_row_archives table not found. Run migrations first.');
        return;
    }

    $messageExists = DB::table('messages')->where('id', $messageId)->exists();
    if ($messageExists) {
        $this->warn("Message {$messageId} already exists. Nothing to restore.");
        return;
    }

    $archiveRow = DB::table('chat_row_archives')
        ->where('table_name', 'messages')
        ->where('row_id', $messageId)
        ->orderByDesc('id')
        ->first();

    if (!$archiveRow) {
        $this->error("No archived message row found for id {$messageId}.");
        return;
    }

    $decodePayload = function ($payload) {
        if (is_array($payload)) return $payload;
        if (is_object($payload)) return (array) $payload;
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            return is_array($decoded) ? $decoded : null;
        }
        return null;
    };

    $msg = $decodePayload($archiveRow->payload);
    if (!$msg) {
        $this->error('Failed to decode archived message payload.');
        return;
    }

    DB::transaction(function () use ($messageId, $msg, $decodePayload) {
        DB::table('messages')->insert([
            'id' => (int) ($msg['id'] ?? $messageId),
            'conversation_id' => (int) $msg['conversation_id'],
            'user_id' => (int) $msg['user_id'],
            'content' => (string) ($msg['content'] ?? ''),
            'story_id' => $msg['story_id'] ?? null,
            'edited_at' => $msg['edited_at'] ?? null,
            'created_at' => $msg['created_at'] ?? now(),
            'updated_at' => $msg['updated_at'] ?? now(),
        ]);

        $attachmentArchives = DB::table('chat_row_archives')
            ->where('table_name', 'media_attachments')
            ->orderByDesc('id')
            ->get();

        $restoredAttachmentCount = 0;
        foreach ($attachmentArchives as $row) {
            $payload = $decodePayload($row->payload);
            if (!$payload) continue;
            if ((int) ($payload['message_id'] ?? 0) !== $messageId) continue;

            $attachmentId = (int) ($payload['id'] ?? 0);
            if ($attachmentId <= 0) continue;

            $alreadyExists = DB::table('media_attachments')->where('id', $attachmentId)->exists();
            if ($alreadyExists) continue;

            DB::table('media_attachments')->insert([
                'id' => $attachmentId,
                'message_id' => $messageId,
                'type' => (string) $payload['type'],
                'file_path' => (string) $payload['file_path'],
                'file_size' => (int) ($payload['file_size'] ?? 0),
                'original_filename' => (string) ($payload['original_filename'] ?? 'attachment'),
                'mime_type' => (string) ($payload['mime_type'] ?? 'application/octet-stream'),
                'created_at' => $payload['created_at'] ?? now(),
                'updated_at' => $payload['updated_at'] ?? now(),
            ]);

            $restoredAttachmentCount++;
        }

        DB::statement("SELECT setval(pg_get_serial_sequence('messages', 'id'), GREATEST((SELECT MAX(id) FROM messages), 1))");
        DB::statement("SELECT setval(pg_get_serial_sequence('media_attachments', 'id'), GREATEST((SELECT MAX(id) FROM media_attachments), 1))");

        $this->info("Restored message {$messageId}.");
        $this->info("Restored attachments: {$restoredAttachmentCount}");
    });
})->purpose('Restore one deleted message (and archived attachments) from chat_row_archives');
