<?php
// Run this file to check push subscriptions
require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use App\Models\PushSubscription;

echo "=== Push Subscriptions Check ===\n\n";

$subscriptions = PushSubscription::selectRaw('user_id, COUNT(*) as count')
    ->groupBy('user_id')
    ->having('count', '>', 1)
    ->get();

if ($subscriptions->isEmpty()) {
    echo "✓ No duplicate subscriptions found!\n";
} else {
    echo "✗ Found users with duplicate subscriptions:\n\n";
    foreach ($subscriptions as $sub) {
        echo "User ID {$sub->user_id}: {$sub->count} subscriptions\n";
        
        $userSubs = PushSubscription::where('user_id', $sub->user_id)
            ->orderBy('created_at', 'desc')
            ->get();
        
        foreach ($userSubs as $index => $userSub) {
            $status = $index === 0 ? '[KEEP]' : '[DELETE]';
            echo "  {$status} ID: {$userSub->id}, Token: " . substr($userSub->token, 0, 20) . "..., Created: {$userSub->created_at}\n";
        }
        echo "\n";
    }
    
    echo "\nTo fix, run this SQL:\n";
    echo "DELETE ps1 FROM push_subscriptions ps1\n";
    echo "INNER JOIN (\n";
    echo "    SELECT user_id, MAX(created_at) as max_created_at\n";
    echo "    FROM push_subscriptions\n";
    echo "    GROUP BY user_id\n";
    echo ") ps2 ON ps1.user_id = ps2.user_id\n";
    echo "WHERE ps1.created_at < ps2.max_created_at;\n";
}

echo "\n=== Logo URL Check ===\n\n";
echo "Frontend URL: " . config('app.frontend_url') . "\n";
echo "Logo URL: " . config('app.frontend_url') . '/logo.png' . "\n";
