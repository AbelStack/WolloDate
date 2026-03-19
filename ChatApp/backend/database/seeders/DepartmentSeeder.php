<?php

namespace Database\Seeders;

use App\Models\Campus;
use App\Models\Department;
use Illuminate\Database\Seeder;

class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        // Main Campus
        $main = Campus::where('name', 'Main')->first();
        if ($main) {
            foreach (['Freshman', 'Remedial', 'Law', 'Accounting', 'Economics', 'Management', 'Psychology', 'Business Administration', 'Journalism',  'Other (specify)'] as $dept) {
                Department::create(['campus_id' => $main->id, 'name' => $dept]);
            }
        }

        // Kombolcha Campus
        $kombolcha = Campus::where('name', 'Kombolcha')->first();
        if ($kombolcha) {
            foreach ([ 'Software Engineering', 'Computer Science', 'Information Technology', 'Information System', 'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Architecture', 'Construction Management', 'Biomedical Engineering', 'Water Resources Engineering', 'Freshman', 'Remedial', 'Other (specify)'] as $dept) {
                Department::create(['campus_id' => $kombolcha->id, 'name' => $dept]);
            }
        }

        // Tita Campus
        $tita = Campus::where('name', 'Tita')->first();
        if ($tita) {
            foreach  (['Medicine', 'Nursing', 'Midwifery', 'Public Health', 'Anesthesia', 'Pharmacy', 'Medical Laboratory Science', 'Other (specify)'] as $dept) {
                Department::create(['campus_id' => $tita->id, 'name' => $dept]);
            }
        }
    }
}
