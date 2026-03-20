<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Admin; // <-- use Admin model instead of User
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run()
    {
        // Create admin only if it doesn't already exist
        Admin::firstOrCreate(
            ['email' => 'abeltewodros83@gmail.com'], // check unique by email
            [
                'name' => 'Abel',
                'password' => Hash::make('@bel1996'),
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }
}