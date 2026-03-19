<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run()
    {
        User::create([
            'name' => 'Abel',
            'email' => 'abeltewodros83@gmail.com',
            'password' => Hash::make('@bel1996'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}