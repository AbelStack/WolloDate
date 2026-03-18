<?php

namespace App\Http\Controllers;

use App\Models\MediaAttachment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MediaController extends Controller
{
    /**
     * Upload file/image/voice
     * POST /api/upload
     * Body: FormData { file, message_id? }
     * Type is auto-detected from MIME. message_id is optional.
     */
    public function upload(Request $request)
    {
        $request->validate([
            'file' => 'required|file|max:51200', // 50MB max request cap
            'message_id' => 'nullable|integer|exists:messages,id',
        ]);

        $file = $request->file('file');
        $mimeType = $file->getMimeType();
        $messageId = $request->input('message_id');

        // Auto-detect type from MIME
        $type = $this->detectType($mimeType, $file->getClientOriginalExtension());
        if (!$type) {
            return response()->json([
                'message' => 'Unsupported file type: ' . $mimeType,
            ], 422);
        }

        // Enforce per-type size limits
        $size = $file->getSize();
        if ($type === 'image' && $size > 50 * 1024 * 1024) {
            return response()->json(['message' => 'Image size must be less than 50MB'], 422);
        }
        if ($type === 'voice' && $size > 10 * 1024 * 1024) {
            return response()->json(['message' => 'Voice file size must be less than 10MB'], 422);
        }

        // Generate unique filename
        $folder = 'uploads/' . $type;
        $originalName = $file->getClientOriginalName();
        $filename = uniqid() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName);

        // Store file
        $path = $file->storeAs($folder, $filename, 'public');

        // Create media attachment record
        $media = MediaAttachment::create([
            'message_id' => $messageId,
            'type' => $type,
            'file_path' => '/storage/' . $path,
            'file_size' => $size,
            'original_filename' => $originalName,
            'mime_type' => $mimeType,
        ]);

        return response()->json([
            'message' => 'File uploaded successfully',
            'media' => $media,
            'url' => '/storage/' . $path,
        ], 201);
    }

    /**
     * Auto-detect upload type from MIME.
     */
    private function detectType(string $mimeType, ?string $extension = null): ?string
    {
        $normalized = strtolower(trim(explode(';', $mimeType)[0]));
        $ext = strtolower((string) $extension);

        $imageTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/heic',
            'image/heif',
            'image/heic-sequence',
            'image/heif-sequence',
            'image/bmp',
        ];
        $audioTypes = [
            'audio/mpeg',
            'audio/wav',
            'audio/webm',
            'audio/ogg',
            'audio/mp4',
            'audio/x-m4a',
            'video/mp4',
            'video/webm',
        ];
        $fileTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
        ];

        if (in_array($normalized, $imageTypes, true)) return 'image';
        if (in_array($normalized, $audioTypes, true)) return 'voice';
        if (in_array($normalized, $fileTypes, true)) return 'file';

        if (str_starts_with($normalized, 'image/')) return 'image';

        // Some clients send generic binary MIME types; use extension fallback.
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'avif'], true)) return 'image';
        if (in_array($ext, ['mp3', 'wav', 'webm', 'ogg', 'm4a', 'aac', 'mp4'], true)) return 'voice';
        if (in_array($ext, ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'], true)) return 'file';

        // Some browsers record mic-only streams with generic audio/* values.
        if (str_starts_with($normalized, 'audio/')) return 'voice';

        return null;
    }

    /**
     * Get media file
     * GET /api/media/{id}
     */
    public function show($id)
    {
        try {
            $media = MediaAttachment::find($id);

            if (!$media) {
                return response()->json([
                    'message' => 'Media not found',
                ], 404);
            }

            // Verify the current user has access to this media's conversation
            if ($media->message_id) {
                $message = \App\Models\Message::find($media->message_id);
                if ($message) {
                    $isMember = \App\Models\ConversationMember::where('conversation_id', $message->conversation_id)
                        ->where('user_id', auth()->id())->exists();
                    if (!$isMember) {
                        return response()->json(['message' => 'Unauthorized'], 403);
                    }
                }
            }

            // Check if file exists
            $filePath = $this->normalizePublicPath($media->file_path);
            if (!Storage::disk('public')->exists($filePath)) {
                return response()->json([
                    'message' => 'File not found',
                ], 404);
            }

            // Return file download
            return response()->download(
                storage_path('app/public/' . $filePath),
                $media->original_filename
            );

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get media',
            ], 500);
        }
    }

    private function normalizePublicPath(?string $path): string
    {
        $normalized = trim((string) $path);
        $normalized = ltrim($normalized, '/');

        if (str_starts_with($normalized, 'storage/')) {
            $normalized = substr($normalized, strlen('storage/'));
        }

        return ltrim($normalized, '/');
    }
}
