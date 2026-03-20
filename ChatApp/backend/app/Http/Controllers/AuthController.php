<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\ActiveUserCapacity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private readonly ActiveUserCapacity $activeUserCapacity)
    {
    }

    /**
     * Heartbeat endpoint to refresh active user TTL in Redis
     * POST /api/auth/heartbeat
     * Requires: Authenticated user (Bearer token)
     */
    public function heartbeat(Request $request)
    {
        $user = $request->user();
        $this->activeUserCapacity->markActive($user->id);
        return response()->json(['message' => 'Heartbeat received'], 200);
    }

    /**
     * User Signup
     * 
     * POST /api/auth/signup
     * Body: { name, username, email, password, password_confirmation, student_id_image }
     */
    public function signup(Request $request)
    {
        $studentIdPath = null;

        try {
            $validated = $request->validate([
                'name' => 'required|string|max:255',
                'username' => [
                    'required',
                    'string',
                    'min:3',
                    'max:30',
                    // Start with any Unicode letter, then allow Unicode letters, numbers, symbols
                    'regex:/^\p{L}[\p{L}\p{N}\p{M}\p{Pd}\p{Pc}\p{S}\d_\-.@]*$/u',
                    'unique:users,username',
                ],
                'email' => 'required|email|unique:users,email|unique:admins,email',
                'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/', 'confirmed'],
                'student_id_image' => 'required|file|max:51200',
                'campus_id' => 'required|integer|exists:campuses,id',
                'department_id' => 'required|integer|exists:departments,id',
                'custom_department' => 'nullable|string|max:100',
            ], [
                'name.required' => 'Full name is required.',
                'name.max' => 'Full name must be 255 characters or less.',
                'username.required' => 'Username is required.',
                'username.min' => 'Username must be at least 3 characters.',
                'username.max' => 'Username must be 30 characters or less.',
                'username.regex' => 'Username must start with a letter and can contain letters, numbers, symbols, and Amharic characters.',
                'username.unique' => 'This username is already taken.',
                'email.required' => 'Email is required.',
                'email.email' => 'Enter a valid email address.',
                'email.unique' => 'This email is already registered.',
                'password.required' => 'Password is required.',
                'password.min' => 'Password must be at least 8 characters.',
                'password.regex' => 'Password must include at least one letter and one number.',
                'password.confirmed' => 'Password confirmation does not match.',
                'student_id_image.required' => 'Student ID image is required.',
                'student_id_image.max' => 'Student ID image must be less than 50MB.',
                'campus_id.required' => 'Please select your campus.',
                'campus_id.exists' => 'Selected campus is invalid.',
                'department_id.required' => 'Please select your department.',
                'department_id.exists' => 'Selected department is invalid.',
                'custom_department.max' => 'Custom department must be 100 characters or less.',
            ]);

            $studentIdFile = $request->file('student_id_image');
            $mimeType = strtolower((string) $studentIdFile?->getMimeType());
            $extension = strtolower((string) $studentIdFile?->getClientOriginalExtension());

            $isImageMime = str_starts_with($mimeType, 'image/');
            $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif', 'jfif'];
            $isImageExtension = in_array($extension, $imageExtensions, true);

            if (!$isImageMime && !$isImageExtension) {
                throw ValidationException::withMessages([
                    'student_id_image' => ['Please upload an image file for your student ID.'],
                ]);
            }

            if ($request->hasFile('student_id_image')) {
                $studentIdPath = $request->file('student_id_image')->store('student_ids', 'public');
            }

            DB::beginTransaction();

            $user = User::create([
                'name' => $validated['name'],
                'username' => strtolower($validated['username']),
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'student_id_image' => $studentIdPath,
                'campus_id' => $validated['campus_id'],
                'department_id' => $validated['department_id'],
                'custom_department' => $validated['custom_department'] ?? null,
                'is_approved' => false,
                'is_private' => true,
            ]);

            DB::commit();

            $verificationEmailSent = true;
            $message = 'Registration successful. Please verify your email before logging in.';

            try {
                $this->sendVerificationEmail($user);
            } catch (\Exception $mailException) {
                $verificationEmailSent = false;
                $message = 'Registration successful, but verification email could not be sent right now. Please use resend verification.';

                Log::warning('Signup completed but verification email failed', [
                    'user_id' => $user->id,
                    'email' => $user->email,
                    'error' => $mailException->getMessage(),
                ]);
            }

            return response()->json([
                'message' => $message,
                'verification_email_sent' => $verificationEmailSent,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'email' => $user->email,
                ],
            ], 201);

        } catch (ValidationException $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            if ($studentIdPath && Storage::disk('public')->exists($studentIdPath)) {
                Storage::disk('public')->delete($studentIdPath);
            }

            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }

            if ($studentIdPath && Storage::disk('public')->exists($studentIdPath)) {
                Storage::disk('public')->delete($studentIdPath);
            }

            Log::error('Signup failed during user creation', [
                'error' => $e->getMessage(),
            ]);

            $message = 'Signup failed. Please try again.';

            if (app()->environment('local')) {
                $message .= ' (' . $e->getMessage() . ')';
            }

            return response()->json([
                'message' => $message,
            ], 500);
        }
    }

    /**
     * User Login
     * 
     * POST /api/auth/login
     * Body: { login, password }
     */
    public function login(Request $request)
    {
        try {
            // Validate input
            $validated = $request->validate([
                'login' => 'nullable|string|max:255',
                'email' => 'nullable|string',
                'password' => 'required|string',
            ], [
                'password.required' => 'Password is required.',
            ]);

            // Find user by email OR username
            $loginValue = $validated['login'] ?? $validated['email'] ?? null;
            $login = trim((string) $loginValue);

            if ($login === '') {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'login' => ['Enter your username or email.'],
                    ],
                ], 422);
            }

            $isEmailLogin = filter_var($login, FILTER_VALIDATE_EMAIL) !== false;

            $user = $isEmailLogin
                ? User::whereRaw('LOWER(email) = ?', [strtolower($login)])->first()
                : User::whereRaw('LOWER(username) = ?', [strtolower($login)])->first();

            if (!$user) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'login' => [
                            $isEmailLogin
                                ? 'No account found with this email.'
                                : 'No account found with this username.'
                        ],
                    ],
                ], 422);
            }

            if (!Hash::check($validated['password'], $user->password)) {
                return response()->json([
                    'message' => 'Validation failed',
                    'errors' => [
                        'password' => ['Incorrect password. Please try again.'],
                    ],
                ], 422);
            }

            if (!$user->hasVerifiedEmail()) {
                return response()->json([
                    'message' => 'Please verify your email before logging in.',
                    'code' => 'email_unverified',
                ], 403);
            }

            // Check if user is banned
            if ($user->is_banned) {
                return response()->json([
                    'message' => 'Your account has been banned. Please contact support.',
                ], 403);
            }

            if ($this->activeUserCapacity->isAtCapacityForUser($user->id)) {
                return response()->json([
                    'message' => 'System is busy now, please come back later.',
                    'code' => 'system_busy',
                ], 429);
            }

            // Mark online heartbeat for active-user capacity tracking.
            $this->activeUserCapacity->markActive($user->id);

            // Create token
            $token = $user->createToken('auth_token')->plainTextToken;

            return response()->json([
                'message' => 'Login successful',
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
                ],
                'token' => $token,
            ], 200);

        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Login failed',
            ], 500);
        }
    }

    /**
     * User Logout
     * 
     * POST /api/auth/logout
     * Requires: Authenticated user (Bearer token)
     */
    public function logout(Request $request)
    {
        try {
            // Get current user
            $user = auth()->user();

            // Mark user as offline
            $user->update([
                'is_online' => false,
                'last_seen' => now(),
            ]);

            $this->activeUserCapacity->remove($user->id);

            // Revoke current token
            $request->user()->currentAccessToken()->delete();

            return response()->json([
                'message' => 'Logged out successfully',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Logout failed',
            ], 500);
        }
    }

    /**
     * Get Current User
     * 
     * GET /api/auth/me
     * Requires: Authenticated user (Bearer token)
     */
    public function me(Request $request)
    {
        try {
            $user = auth()->user();

            $this->activeUserCapacity->refreshHeartbeat($user->id);

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
                    'email_verified_at' => $user->email_verified_at,
                    'last_seen' => $user->last_seen,
                    'created_at' => $user->created_at,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to get user',
            ], 500);
        }
    }

    /**
     * Verify email from signed link.
     *
     * GET /api/auth/email/verify/{id}/{hash}
     */
    public function verifyEmail(Request $request, int $id, string $hash)
    {
        $frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/');
        $redirectBase = $frontendUrl . '/login';

        if (!$request->hasValidSignature(false)) {
            return redirect()->away($redirectBase . '?verified=expired');
        }

        $user = User::find($id);
        if (!$user) {
            return redirect()->away($redirectBase . '?verified=invalid');
        }

        if (!hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
            return redirect()->away($redirectBase . '?verified=invalid');
        }

        if (!$user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        return redirect()->away($redirectBase . '?verified=success');
    }

    /**
     * Resend verification email to unverified user.
     *
     * POST /api/auth/email/resend
     */
    public function resendVerification(Request $request)
    {
        try {
            $validated = $request->validate([
                'email' => 'required|email',
            ]);

            $user = User::where('email', $validated['email'])->first();

            if (!$user) {
                return response()->json([
                    'message' => 'If this email exists, a verification link has been sent.',
                ], 200);
            }

            if ($user->hasVerifiedEmail()) {
                return response()->json([
                    'message' => 'Email is already verified. You can log in now.',
                ], 200);
            }

            $this->sendVerificationEmail($user);

            return response()->json([
                'message' => 'Verification link sent.',
            ], 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to resend verification email.',
            ], 500);
        }
    }

    /**
     * Send password reset link.
     *
     * POST /api/auth/password/forgot
     */
    public function forgotPassword(Request $request)
    {
        try {
            $validated = $request->validate([
                'email' => 'required|email',
            ]);

            $user = User::whereRaw('LOWER(email) = ?', [strtolower($validated['email'])])->first();

            // Always return the same response so emails cannot be enumerated.
            if (!$user) {
                return response()->json([
                    'message' => 'If this email exists, a password reset link has been sent.',
                ], 200);
            }

            $token = Password::broker('users')->createToken($user);

            $frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/');
            $resetUrl = $frontendUrl
                . '/reset-password?token=' . urlencode($token)
                . '&email=' . urlencode((string) $user->email);

            Mail::send([], [], function ($message) use ($user, $resetUrl) {
                $message
                    ->to($user->email)
                    ->subject('Reset your password')
                    ->html(
                        '<h2>Password reset request</h2>' .
                        '<p>Click the link below to reset your password.</p>' .
                        '<p><a href="' . e($resetUrl) . '">Reset Password</a></p>' .
                        '<p>This link expires in 60 minutes.</p>'
                    );
            });

            return response()->json([
                'message' => 'If this email exists, a password reset link has been sent.',
            ], 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Failed to send password reset link', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to process password reset request.',
            ], 500);
        }
    }

    /**
     * Reset password with token.
     *
     * POST /api/auth/password/reset
     */
    public function resetPassword(Request $request)
    {
        try {
            $validated = $request->validate([
                'token' => 'required|string',
                'email' => 'required|email',
                'password' => ['required', 'string', 'min:8', 'regex:/^(?=.*[A-Za-z])(?=.*\d).+$/', 'confirmed'],
            ], [
                'token.required' => 'Reset token is required.',
                'email.required' => 'Email is required.',
                'email.email' => 'Enter a valid email address.',
                'password.required' => 'Password is required.',
                'password.min' => 'Password must be at least 8 characters.',
                'password.regex' => 'Password must include at least one letter and one number.',
                'password.confirmed' => 'Password confirmation does not match.',
            ]);

            $status = Password::broker('users')->reset(
                [
                    'email' => $validated['email'],
                    'password' => $validated['password'],
                    'password_confirmation' => $request->input('password_confirmation'),
                    'token' => $validated['token'],
                ],
                function (User $user, string $password) {
                    $user->forceFill([
                        'password' => Hash::make($password),
                    ])->save();

                    // Invalidate all current tokens after password reset.
                    $user->tokens()->delete();
                }
            );

            if ($status !== Password::PASSWORD_RESET) {
                return response()->json([
                    'message' => 'Reset link is invalid or expired.',
                    'errors' => [
                        'token' => ['Reset link is invalid or expired.'],
                    ],
                ], 422);
            }

            return response()->json([
                'message' => 'Password reset successful. You can now log in.',
            ], 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Password reset failed', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Password reset failed.',
            ], 500);
        }
    }

    private function sendVerificationEmail(User $user): void
    {
        $verificationPath = URL::temporarySignedRoute(
            'auth.verification.verify',
            now()->addMinutes(60),
            [
                'id' => $user->id,
                'hash' => sha1($user->getEmailForVerification()),
            ],
            false
        );

        $verificationBaseUrl = rtrim((string) env(
            'VERIFICATION_LINK_BASE_URL',
            env('FRONTEND_URL', (string) config('app.url', 'http://localhost:8000'))
        ), '/');
        $verificationUrl = $verificationBaseUrl . '/' . ltrim($verificationPath, '/');

        Mail::send([], [], function ($message) use ($user, $verificationUrl) {
            $message
                ->to($user->email)
                ->subject('Verify your email address')
                ->html(
                    '<h2>Verify your email</h2>' .
                    '<p>Click the link below to verify your account.</p>' .
                    '<p><a href="' . e($verificationUrl) . '">Verify Email</a></p>' .
                    '<p>This link expires in 60 minutes.</p>'
                );
        });
    }
}
