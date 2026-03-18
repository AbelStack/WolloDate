<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('student_id_image')->nullable()->after('avatar_url');
            $table->boolean('is_approved')->default(false)->after('student_id_image');
            $table->boolean('is_private')->default(true)->after('is_approved');
            $table->enum('role', ['user', 'admin'])->default('user')->after('is_private');
            $table->timestamp('approved_at')->nullable()->after('role');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete()->after('approved_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropColumn(['student_id_image', 'is_approved', 'is_private', 'role', 'approved_at', 'approved_by']);
        });
    }
};
