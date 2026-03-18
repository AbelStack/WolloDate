<?php

namespace Database\Seeders;

use App\Models\Campus;
use Illuminate\Database\Seeder;

class CampusSeeder extends Seeder
{
    public function run(): void
    {
        Campus::create(['name' => 'Main', 'location' => 'Central City']);
        Campus::create(['name' => 'Kombolcha', 'location' => 'Kombolcha']);
        Campus::create(['name' => 'Tita', 'location' => 'Tita']);
    }
}
