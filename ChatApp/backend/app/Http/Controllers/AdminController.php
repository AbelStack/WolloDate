<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\Story;
use App\Models\User;
use App\Models\Comment;
use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AdminController extends Controller
{
    /**
     * Get pending user registrations
     * GET /api/admin/users/pending
     */
    public function getPendingUsers(Request $request)
    {
        $users = User::where('is_approved', false)
            ->orderBy('created_at', 'asc')
            ->get([
                'id', 'name', 'email', 'student_id_image', 'created_at'
            ]);

        return response()->json($users);
    }

    /**
     * Approve a user registration
     * PUT /api/admin/users/{userId}/approve
     */
    public function approveUser(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        if ($user->is_approved) {
            return response()->json(['message' => 'User already approved'], 400);
        }

        $user->update([
            'is_approved' => true,
            'approved_at' => now(),
        ]);

        return response()->json([
            'message' => 'User approved successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ]);
    }

    /**
     * Reject a user registration
     * DELETE /api/admin/users/{userId}/reject
     */
    public function rejectUser(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        if ($user->is_approved) {
            return response()->json(['message' => 'Cannot reject an approved user. Use ban instead.'], 400);
        }

        // Delete the user and their student ID image
        if ($user->student_id_image) {
            $studentIdPath = $this->normalizePublicPath($user->student_id_image);
            if ($studentIdPath) {
                Storage::disk('public')->delete($studentIdPath);
            }
        }

        $user->delete();

        return response()->json(['message' => 'User registration rejected and deleted']);
    }

    /**
     * Get all approved users
     * GET /api/admin/users
     */
    public function getUsers(Request $request)
    {
        $query = User::where('is_approved', true);

        // Filter by search term
        if ($request->has('search') && $request->input('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('username', 'like', "%{$search}%");
            });
        }

        // Filter by banned status
        if ($request->has('banned')) {
            $query->where('is_banned', $request->boolean('banned'));
        }

        $users = $query->orderBy('created_at', 'desc')
            ->paginate(20, ['id', 'name', 'username', 'email', 'avatar_url', 'created_at', 'is_online', 'last_seen', 'is_banned']);

        return response()->json($users);
    }

    /**
     * Ban a user
     * PUT /api/admin/users/{userId}/ban
     */
    public function banUser(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        // Revoke all tokens (force logout)
        $user->tokens()->delete();

        // Mark as banned
        $user->update(['is_banned' => true]);

        return response()->json(['message' => 'User banned successfully']);
    }

    /**
     * Unban a user
     * PUT /api/admin/users/{userId}/unban
     */
    public function unbanUser(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        if (!$user->is_banned) {
            return response()->json(['message' => 'User is not banned'], 400);
        }

        $user->update(['is_banned' => false]);

        return response()->json(['message' => 'User unbanned successfully']);
    }

    /**
     * Delete a user permanently
     * DELETE /api/admin/users/{userId}
     */
    public function deleteUser(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        // Delete user's avatar if exists
        if ($user->avatar_url) {
            $avatarPath = $this->normalizePublicPath($user->avatar_url);
            if ($avatarPath) {
                Storage::disk('public')->delete($avatarPath);
            }
        }

        // Delete student ID image if exists
        if ($user->student_id_image) {
            $studentIdPath = $this->normalizePublicPath($user->student_id_image);
            if ($studentIdPath) {
                Storage::disk('public')->delete($studentIdPath);
            }
        }

        // Revoke all tokens
        $user->tokens()->delete();

        // Delete the user (cascades handled by foreign keys)
        $user->delete();

        return response()->json(['message' => 'User deleted permanently']);
    }

    /**
     * Delete a post (admin action)
     * DELETE /api/admin/posts/{postId}
     */
    public function deletePost(Request $request, $postId)
    {
        $post = Post::findOrFail($postId);
        
        // Delete all post images (supports multi-image posts)
        $mediaPaths = [];
        if (is_array($post->media_urls) && count($post->media_urls) > 0) {
            $mediaPaths = $post->media_urls;
        } elseif ($post->image_url) {
            $mediaPaths = [$post->image_url];
        }

        foreach ($mediaPaths as $rawPath) {
            $imagePath = $this->normalizePublicPath($rawPath);
            if ($imagePath) {
                Storage::disk('public')->delete($imagePath);
            }
        }
        
        $post->delete();

        return response()->json(['message' => 'Post deleted by admin']);
    }

    /**
     * Delete a comment (admin action)
     * DELETE /api/admin/comments/{commentId}
     */
    public function deleteComment(Request $request, $commentId)
    {
        $comment = Comment::findOrFail($commentId);
        $comment->delete();

        return response()->json(['message' => 'Comment deleted by admin']);
    }

    /**
     * Delete a story (admin action)
     * DELETE /api/admin/stories/{storyId}
     */
    public function deleteStory(Request $request, $storyId)
    {
        $story = Story::findOrFail($storyId);
        
        // Delete media file
        if ($story->media_path) {
            Storage::disk('local')->delete($story->media_path);
        }
        
        $story->delete();

        return response()->json(['message' => 'Story deleted by admin']);
    }

    /**
     * Get admin dashboard stats
     * GET /api/admin/stats
     */
    public function getStats(Request $request)
    {
        return response()->json([
            'pending_users' => User::where('is_approved', false)->count(),
            'total_users' => User::where('is_approved', true)->count(),
            'banned_users' => User::where('is_banned', true)->count(),
            'total_posts' => Post::count(),
            'total_stories' => Story::where('expires_at', '>', now())->count(),
            'online_users' => User::where('is_online', true)->count(),
            'pending_reports' => Report::where('status', 'pending')->count(),
        ]);
    }

    /**
     * Get all posts for content moderation
     * GET /api/admin/posts
     */
    public function getPosts(Request $request)
    {
        $query = Post::with(['user:id,name,username,avatar_url']);

        if ($request->has('search') && $request->input('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('caption', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($userQuery) use ($search) {
                      $userQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('username', 'like', "%{$search}%");
                  });
            });
        }

        $posts = $query->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($posts);
    }

    /**
     * Get all active stories for content moderation
     * GET /api/admin/stories
     */
    public function getStories(Request $request)
    {
        $query = Story::with(['user:id,name,username,avatar_url'])
            ->where('expires_at', '>', now());

        if ($request->has('search') && $request->input('search')) {
            $search = $request->input('search');
            $query->whereHas('user', function ($userQuery) use ($search) {
                $userQuery->where('name', 'like', "%{$search}%")
                          ->orWhere('username', 'like', "%{$search}%");
            });
        }

        $stories = $query->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($stories);
    }

    /**
     * Get all reports
     * GET /api/admin/reports
     */
    public function getReports(Request $request)
    {
        $query = Report::with([
            'reporter:id,name,username,avatar_url',
            'reviewer:id,name'
        ]);

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        } else {
            // Default to pending reports
            $query->where('status', 'pending');
        }

        // Filter by type
        if ($request->has('type')) {
            $typeMap = [
                'post' => 'App\\Models\\Post',
                'comment' => 'App\\Models\\Comment',
                'story' => 'App\\Models\\Story',
                'user' => 'App\\Models\\User',
            ];
            if (isset($typeMap[$request->input('type')])) {
                $query->where('reportable_type', $typeMap[$request->input('type')]);
            }
        }

        $reports = $query->orderBy('created_at', 'desc')
            ->paginate(20);

        // Load the reportable content for each report
        $reports->getCollection()->transform(function ($report) {
            $reportable = $report->reportable;
            if ($reportable) {
                if ($report->reportable_type === 'App\\Models\\Post') {
                    $report->content = [
                        'type' => 'post',
                        'id' => $reportable->id,
                        'caption' => $reportable->caption,
                        'image_url' => $reportable->image_url,
                        'user' => $reportable->user ? [
                            'id' => $reportable->user->id,
                            'name' => $reportable->user->name,
                            'username' => $reportable->user->username,
                        ] : null,
                    ];
                } elseif ($report->reportable_type === 'App\\Models\\Comment') {
                    $report->content = [
                        'type' => 'comment',
                        'id' => $reportable->id,
                        'body' => $reportable->body,
                        'user' => $reportable->user ? [
                            'id' => $reportable->user->id,
                            'name' => $reportable->user->name,
                            'username' => $reportable->user->username,
                        ] : null,
                    ];
                } elseif ($report->reportable_type === 'App\\Models\\Story') {
                    $report->content = [
                        'type' => 'story',
                        'id' => $reportable->id,
                        'media_type' => $reportable->media_type,
                        'user' => $reportable->user ? [
                            'id' => $reportable->user->id,
                            'name' => $reportable->user->name,
                            'username' => $reportable->user->username,
                        ] : null,
                    ];
                } elseif ($report->reportable_type === 'App\\Models\\User') {
                    $report->content = [
                        'type' => 'user',
                        'id' => $reportable->id,
                        'name' => $reportable->name,
                        'username' => $reportable->username,
                        'avatar_url' => $reportable->avatar_url,
                    ];
                }
            } else {
                $report->content = null;
            }
            return $report;
        });

        return response()->json($reports);
    }

    /**
     * Review a report
     * PUT /api/admin/reports/{reportId}
     */
    public function reviewReport(Request $request, $reportId)
    {
        $request->validate([
            'status' => 'required|in:reviewed,resolved,dismissed',
            'admin_notes' => 'nullable|string|max:1000',
            'action' => 'nullable|in:delete_content,ban_user,none',
        ]);

        $report = Report::findOrFail($reportId);

        // Get the admin from the token
        $admin = $request->user();

        $report->update([
            'status' => $request->status,
            'admin_notes' => $request->admin_notes,
            'reviewed_by' => $admin->id,
            'reviewed_at' => now(),
        ]);

        // Take action if specified
        if ($request->action === 'delete_content' && $report->reportable) {
            $reportable = $report->reportable;
            
            if ($report->reportable_type === 'App\\Models\\Post') {
                if ($reportable->image_url) {
                    $imagePath = $this->normalizePublicPath($reportable->image_url);
                    if ($imagePath) {
                        Storage::disk('public')->delete($imagePath);
                    }
                }
                $reportable->delete();
            } elseif ($report->reportable_type === 'App\\Models\\Comment') {
                $reportable->delete();
            } elseif ($report->reportable_type === 'App\\Models\\Story') {
                if ($reportable->media_path) {
                    Storage::disk('local')->delete($reportable->media_path);
                }
                $reportable->delete();
            }
        } elseif ($request->action === 'ban_user' && $report->reportable) {
            $user = null;
            if ($report->reportable_type === 'App\\Models\\User') {
                $user = $report->reportable;
            } elseif (method_exists($report->reportable, 'user')) {
                $user = $report->reportable->user;
            }
            
            if ($user) {
                $user->tokens()->delete();
                $user->update(['is_banned' => true]);
            }
        }

        return response()->json([
            'message' => 'Report reviewed successfully',
            'report' => $report,
        ]);
    }

    private function normalizePublicPath(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        $normalized = trim($path);
        if (preg_match('/^https?:\\/\\//i', $normalized)) {
            $parsedPath = parse_url($normalized, PHP_URL_PATH);
            $normalized = is_string($parsedPath) ? $parsedPath : '';
        }

        $normalized = ltrim($normalized, '/');
        if (str_starts_with($normalized, 'storage/')) {
            $normalized = substr($normalized, strlen('storage/'));
        }

        return ltrim($normalized, '/');
    }
}
