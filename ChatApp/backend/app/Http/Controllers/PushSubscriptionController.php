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

            // Check if token already exists for this user
            $subscription = PushSubscription::where('user_id', $user->id)
                ->where('token', $validated['token'])
                ->first();

            if ($subscription) {
                // Update existing subscription
                $subscription->update([
                    'device_type' => $validated['device_type'] ?? $subscription->device_type,
                ]);

                return response()->json([
                    'message' => 'Push subscription updated',
                    'data' => $subscription,
                ], 200);
            }

            // Create new subscription
            $subscription = PushSubscription::create([
                'user_id' => $user->id,
                'token' => $validated['token'],
                'device_type' => $validated['device_type'] ?? null,
            ]);

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
}
