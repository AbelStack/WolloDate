<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('campus_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('custom_department', 100)->nullable();

            $table->index(['campus_id', 'department_id']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeignKeyIfExists(['campus_id']);
            $table->dropForeignKeyIfExists(['department_id']);
            $table->dropIndex(['campus_id', 'department_id']);
            $table->dropColumn(['campus_id', 'department_id', 'custom_department']);
        });
    }
};
