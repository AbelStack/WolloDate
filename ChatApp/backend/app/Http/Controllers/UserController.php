<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserBlock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    /**
     * Get User Profile
     * 
     * GET /api/users/{id}
     * Returns complete profile data including counts and relationship status
     */
    public function show(Request $request, $id)
    {
        try {
            $user = User::find($id);

            if (!$user) {
                return response()->json([
                    'message' => 'User not found',
                ], 404);
            }

            $currentUser = $request->user();
            
            // Get counts efficiently with single queries
            $followersCount = $user->followers()->count();
            $followingCount = $user->following()->count();
            $postsCount = $user->posts()->count();
            
            // Check relationship with current user
            $isFollowing = false;
            $isPendingFollow = false;
            
            if ($currentUser && $currentUser->id !== $user->id) {
                $isFollowing = $currentUser->isFollowing($user);
                $isPendingFollow = $currentUser->hasPendingFollowRequest($user);
            }

            return response()->json([
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'email' => $user->email,
                    'avatar_url' => $user->avatar_url,
                    'bio' => $user->bio,
                    'status_message' => $user->status_message,
                    'is_online' => $user->is_online,
                    'is_approved' => $user->is_approved,
                    'is_private' => $user->is_private,
                    'last_seen' => $user->last_seen,
                    'created_at' => $user->created_at,
                    // Include counts
                    'followers_count' => $followersCount,
                    'following_count' => $followingCount,
                    'posts_count' => $postsCount,
                    // Include relationship status
                    'is_following' => $isFollowing,
                    'is_pending_follow' => $isPendingFollow,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get user',
            ], 500);
        }
    }

    /**
     * Update User Profile
     * 
     * PUT /api/users/{id}
     * Body: { name, bio, status_message }
     */
    public function update(Request $request, $id)
    {
        try {
            $user = User::find($id);

            if (!$user) {
                return response()->json([
                    'message' => 'User not found',
                ], 404);
            }

            // Check if user is updating their own profile
            if (auth()->user()->id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // Validate input
            $validated = $request->validate([
                'name' => 'sometimes|string|max:255',
                'username' => 'sometimes|string|min:3|max:30|regex:/^[a-zA-Z0-9_]+$/|unique:users,username,' . $id,
                'bio' => 'nullable|string|max:500',
                'status_message' => 'nullable|string|max:100',
                'is_private' => 'sometimes|boolean',
            ], [
                'username.regex' => 'Username can only contain letters, numbers, and underscores.',
                'username.unique' => 'This username is already taken.',
            ]);

            // Lowercase username if provided
            if (isset($validated['username'])) {
                $validated['username'] = strtolower($validated['username']);
            }

            // Update user
            $user->update($validated);

            return response()->json([
                'message' => 'Profile updated successfully',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'email' => $user->email,
                    'avatar_url' => $user->avatar_url,
                    'bio' => $user->bio,
                    'status_message' => $user->status_message,
                    'is_private' => $user->is_private,
                ],
            ], 200);

        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Update failed',
            ], 500);
        }
    }

    /**
     * Change account password.
     *
     * PUT /api/users/{id}/password
     * Body: { current_password, password, password_confirmation }
     */
    public function changePassword(Request $request, $id)
    {
        try {
            $user = User::find($id);

            if (!$user) {
                return response()->json([
                    'message' => 'User not found',
                ], 404);
            }

            if (auth()->user()->id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            $validated = $request->validate([
                'current_password' => 'required|string',
                'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/', 'confirmed'],
            ], [
                'current_password.required' => 'Current password is required.',
                'password.required' => 'New password is required.',
                'password.min' => 'New password must be at least 8 characters.',
                'password.regex' => 'New password must include at least one letter and one number.',
                'password.confirmed' => 'Password confirmation does not match.',
            ]);

            if (!Hash::check($validated['current_password'], $user->password)) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'current_password' => ['Current password is incorrect.'],
                    ],
                ], 422);
            }

            $user->update([
                'password' => Hash::make($validated['password']),
            ]);

            // Revoke all API tokens so old sessions are invalid after password change.
            $user->tokens()->delete();

            return response()->json([
                'message' => 'Password updated successfully. Please log in again.',
            ], 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Password update failed',
            ], 500);
        }
    }

    /**
     * Upload Profile Avatar
     * 
     * POST /api/users/{id}/avatar
     * Body: { avatar: file }
     */
    public function uploadAvatar(Request $request, $id)
    {
        try {
            $user = User::find($id);

            if (!$user) {
                return response()->json([
                    'message' => 'User not found',
                ], 404);
            }

            // Check authorization
            if (auth()->user()->id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // Validate file
            $validated = $request->validate([
                'avatar' => 'required|image|max:5120', // 5MB
            ]);

            // Delete old avatar if exists
            if ($user->avatar_url) {
                $relativePath = ltrim(str_replace('/storage/', '', $user->avatar_url), '/');
                Storage::disk('public')->delete($relativePath);
            }

            // Store avatar
            $file = $request->file('avatar');
            $extension = $file->getClientOriginalExtension() ?: 'jpg';
            $filename = $user->id . '_avatar_' . time() . '.' . $extension;
            $path = $file->storeAs('avatars', $filename, 'public');

            // Update user avatar_url with full URL
            $avatarUrl = '/storage/' . $path;
            $user->update(['avatar_url' => $avatarUrl]);

            return response()->json([
                'message' => 'Avatar uploaded successfully',
                'avatar_url' => $avatarUrl,
            ], 200);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Upload failed',
            ], 500);
        }
    }

    /**
     * Delete Profile Avatar
     * 
     * DELETE /api/users/{id}/avatar
     */
    public function deleteAvatar($id)
    {
        try {
            $user = User::find($id);

            if (!$user) {
                return response()->json([
                    'message' => 'User not found',
                ], 404);
            }

            // Check authorization
            if (auth()->user()->id != $user->id) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            // Delete old avatar file
            if ($user->avatar_url) {
                $relativePath = ltrim(str_replace('/storage/', '', $user->avatar_url), '/');
                Storage::disk('public')->delete($relativePath);
            }

            // Reset avatar_url to null
            $user->update(['avatar_url' => null]);

            return response()->json([
                'message' => 'Avatar deleted successfully',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Delete failed',
            ], 500);
        }
    }

    /**
     * Search Users
     * 
     * GET /api/users/search?q=john
     */
    public function search(Request $request)
    {
        try {
            $query = $request->query('q');

            if (!$query || strlen($query) < 2) {
                return response()->json([
                    'message' => 'Search query must be at least 2 characters',
                ], 400);
            }

            $users = User::where('name', 'like', "%{$query}%")
                ->orWhere('username', 'like', "%{$query}%")
                ->select('id', 'name', 'username', 'avatar_url', 'is_online')
                ->limit(20)
                ->get();

            return response()->json([
                'count' => $users->count(),
                'users' => $users,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Search failed',
            ], 500);
        }
    }

    /**
     * Block User
     * 
     * POST /api/users/{id}/block
     */
    public function blockUser($id)
    {
        try {
            $blockedUser = User::find($id);
            $currentUser = auth()->user();

            if (!$blockedUser) {
                return response()->json([
                    'message' => 'User not found',
                ], 404);
            }

            if ($currentUser->id == $blockedUser->id) {
                return response()->json([
                    'message' => 'Cannot block yourself',
                ], 400);
            }

            // Check if already blocked
            $exists = UserBlock::where('user_id', $currentUser->id)
                ->where('blocked_user_id', $blockedUser->id)
                ->exists();

            if ($exists) {
                return response()->json([
                    'message' => 'User already blocked',
                ], 400);
            }

            // Create block record
            UserBlock::create([
                'user_id' => $currentUser->id,
                'blocked_user_id' => $blockedUser->id,
            ]);

            return response()->json([
                'message' => 'User blocked successfully',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Block failed',
            ], 500);
        }
    }

    /**
     * Unblock User
     * 
     * DELETE /api/users/{id}/block
     */
    public function unblockUser($id)
    {
        try {
            $currentUser = auth()->user();

            $deleted = UserBlock::where('user_id', $currentUser->id)
                ->where('blocked_user_id', $id)
                ->delete();

            if ($deleted === 0) {
                return response()->json([
                    'message' => 'User was not blocked',
                ], 400);
            }

            return response()->json([
                'message' => 'User unblocked successfully',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Unblock failed',
            ], 500);
        }
    }

    /**
     * Get Blocked Users
     * 
     * GET /api/users/{id}/blocked
     */
    public function getBlockedUsers($id)
    {
        try {
            $currentUser = auth()->user();

            // Check if user is viewing their own block list
            if ($currentUser->id != $id) {
                return response()->json([
                    'message' => 'Unauthorized',
                ], 403);
            }

            $blockedUsers = UserBlock::where('user_id', $currentUser->id)
                ->with('blockedUser:id,name,email,avatar_url')
                ->get()
                ->map(function ($block) {
                    return $block->blockedUser;
                })
                ->values();

            return response()->json([
                'count' => $blockedUsers->count(),
                'blockedUsers' => $blockedUsers,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get blocked users',
            ], 500);
        }
    }
}
