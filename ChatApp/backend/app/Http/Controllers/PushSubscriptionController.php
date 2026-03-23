<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    /**
     * Save or update push subscription token
     * POST /api/push-subscriptions
     * Body: { token, device_type? }
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'token' => 'required|string|max:255',
                'device_type' => 'nullable|string|max:50',
            ]);

            $user = auth()->user();

            // Check if token already exists for this user (or any user to prevent cross-user duplicates)
            $subscription = PushSubscription::where('token', $validated['token'])->first();

            if ($subscription) {
                // Update existing subscription (reassign to current user if needed)
                $subscription->update([
                    'user_id' => $user->id,
                    'device_type' => $validated['device_type'] ?? $subscription->device_type,
                ]);

                \Log::info("Push subscription updated for user {$user->id}, token: " . substr($validated['token'], 0, 20) . '...');

                return response()->json([
                    'message' => 'Push subscription updated',
                    'data' => $subscription,
                ], 200);
            }

            // CRITICAL FIX: Before creating new subscription, delete all old subscriptions for this user
            // This prevents accumulation of stale tokens when Firebase generates new ones
            $oldSubscriptions = PushSubscription::where('user_id', $user->id)->get();
            if ($oldSubscriptions->count() > 0) {
                \Log::info("Deleting {$oldSubscriptions->count()} old subscription(s) for user {$user->id} before creating new one");
                PushSubscription::where('user_id', $user->id)->delete();
            }

            // Create new subscription
            $subscription = PushSubscription::create([
                'user_id' => $user->id,
                'token' => $validated['token'],
                'device_type' => $validated['device_type'] ?? null,
            ]);

            \Log::info("Push subscription created for user {$user->id}, token: " . substr($validated['token'], 0, 20) . '...');

            return response()->json([
                'message' => 'Push subscription created',
                'data' => $subscription,
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Failed to save push subscription: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to save push subscription',
            ], 500);
        }
    }

    /**
     * Delete push subscription (unsubscribe)
     * DELETE /api/push-subscriptions
     * Body: { token? } - if no token provided, deletes all user's subscriptions
     */
    public function destroy(Request $request)
    {
        try {
            $user = auth()->user();
            $token = $request->input('token');

            if ($token) {
                // Delete specific token
                $deleted = PushSubscription::where('user_id', $user->id)
                    ->where('token', $token)
                    ->delete();

                if ($deleted === 0) {
                    return response()->json([
                        'message' => 'Subscription not found',
                    ], 404);
                }

                return response()->json([
                    'message' => 'Push subscription deleted',
                ], 200);
            }

            // Delete all user's subscriptions
            PushSubscription::where('user_id', $user->id)->delete();

            return response()->json([
                'message' => 'All push subscriptions deleted',
            ], 200);

        } catch (\Exception $e) {
            \Log::error('Failed to delete push subscription: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to delete push subscription',
            ], 500);
        }
    }

    /**
     * Get user's push subscriptions
     * GET /api/push-subscriptions
     */
    public function index()
    {
        try {
            $user = auth()->user();
            $subscriptions = PushSubscription::where('user_id', $user->id)->get();

            return response()->json([
                'data' => $subscriptions,
            ], 200);

        } catch (\Exception $e) {
            \Log::error('Failed to get push subscriptions: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to get push subscriptions',
            ], 500);
        }
    }

    /**
     * Send a test notification
     * POST /api/push-subscriptions/test
     */
    public function test(Request $request)
    {
        try {
            $user = auth()->user();
            
            // Check if user has subscriptions
            $subscriptions = PushSubscription::where('user_id', $user->id)->get();
            
            if ($subscriptions->isEmpty()) {
                return response()->json([
                    'message' => 'No push subscriptions found. Please enable notifications first.',
                ], 404);
            }

            // Send test notification
            $pushService = app(\App\Services\PushNotificationService::class);
            $result = $pushService->sendToUser(
                $user,
                'Test Notification',
                'This is a test notification from WolloGram! 🎉',
                [
                    'type' => 'test',
                    'timestamp' => now()->toIso8601String(),
                ]
            );

            if ($result) {
                return response()->json([
                    'message' => 'Test notification sent successfully!',
                    'subscriptions_count' => $subscriptions->count(),
                ], 200);
            } else {
                return response()->json([
                    'message' => 'Failed to send test notification. Check backend logs.',
                ], 500);
            }

        } catch (\Exception $e) {
            \Log::error('Failed to send test notification: ' . $e->getMessage());
            \Log::error('Stack trace: ' . $e->getTraceAsString());
            return response()->json([
                'message' => 'Failed to send test notification',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Clean up duplicate subscriptions for current user
     * POST /api/push-subscriptions/cleanup
     */
    public function cleanup(Request $request)
    {
        try {
            $user = auth()->user();
            
            // Get all subscriptions for this user
            $subscriptions = PushSubscription::where('user_id', $user->id)
                ->orderBy('created_at', 'desc')
                ->get();
            
            if ($subscriptions->count() <= 1) {
                return response()->json([
                    'message' => 'No duplicates found',
                    'subscriptions_count' => $subscriptions->count(),
                ], 200);
            }

            // Keep only the most recent subscription, delete the rest
            $toKeep = $subscriptions->first();
            $toDelete = $subscriptions->slice(1);
            
            $deletedCount = 0;
            foreach ($toDelete as $subscription) {
                $subscription->delete();
                $deletedCount++;
            }

            return response()->json([
                'message' => 'Duplicate subscriptions cleaned up',
                'deleted_count' => $deletedCount,
                'remaining_count' => 1,
            ], 200);

        } catch (\Exception $e) {
            \Log::error('Failed to cleanup subscriptions: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to cleanup subscriptions',
            ], 500);
        }
    }

    /**
     * Get duplicate subscription statistics (for monitoring)
     * GET /api/push-subscriptions/stats
     */
    public function stats()
    {
        try {
            $user = auth()->user();
            
            // Get user's subscription count
            $userSubscriptionCount = PushSubscription::where('user_id', $user->id)->count();
            
            // Get user's subscriptions with details
            $userSubscriptions = PushSubscription::where('user_id', $user->id)
                ->orderBy('created_at', 'desc')
                ->get()
                ->map(function ($sub) {
                    return [
                        'id' => $sub->id,
                        'token_preview' => substr($sub->token, 0, 30) . '...',
                        'device_type' => $sub->device_type,
                        'created_at' => $sub->created_at,
                    ];
                });

            return response()->json([
                'user_id' => $user->id,
                'subscription_count' => $userSubscriptionCount,
                'has_duplicates' => $userSubscriptionCount > 1,
                'subscriptions' => $userSubscriptions,
            ], 200);

        } catch (\Exception $e) {
            \Log::error('Failed to get subscription stats: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to get subscription stats',
            ], 500);
        }
    }
}
