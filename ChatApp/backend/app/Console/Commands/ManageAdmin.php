<?php

namespace App\Console\Commands;

use App\Models\Admin;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class ManageAdmin extends Command
{
    protected $signature = 'admin:manage 
                            {action : The action to perform (create, delete, list, reset-password)}
                            {--email= : Admin email}
                            {--password= : Admin password}
                            {--name= : Admin name}';

    protected $description = 'Manage admin accounts (create, delete, list, reset-password)';

    public function handle(): int
    {
        $action = $this->argument('action');

        return match ($action) {
            'create' => $this->createAdmin(),
            'delete' => $this->deleteAdmin(),
            'list' => $this->listAdmins(),
            'reset-password' => $this->resetPassword(),
            default => $this->invalidAction(),
        };
    }

    private function createAdmin(): int
    {
        $email = $this->option('email') ?: $this->ask('Enter admin email');
        $password = $this->option('password') ?: $this->secret('Enter admin password');
        $name = $this->option('name') ?: $this->ask('Enter admin name', 'Admin');

        if (Admin::where('email', $email)->exists()) {
            $this->error("Admin with email {$email} already exists.");
            return Command::FAILURE;
        }

        // Check that email is not used by a regular user
        if (User::where('email', $email)->exists()) {
            $this->error("Email {$email} is already used by a regular user. Delete that user first or use a different email.");
            return Command::FAILURE;
        }

        $admin = Admin::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
        ]);

        $this->info("Admin account created successfully!");
        $this->table(
            ['ID', 'Name', 'Email'],
            [[$admin->id, $admin->name, $admin->email]]
        );

        return Command::SUCCESS;
    }

    private function deleteAdmin(): int
    {
        $email = $this->option('email') ?: $this->ask('Enter admin email to delete');

        $admin = Admin::where('email', $email)->first();

        if (!$admin) {
            $this->error("Admin with email {$email} not found.");
            return Command::FAILURE;
        }

        if (!$this->confirm("Are you sure you want to delete admin {$email}?")) {
            $this->info('Cancelled.');
            return Command::SUCCESS;
        }

        // Revoke all tokens
        $admin->tokens()->delete();
        $admin->delete();

        $this->info("Admin {$email} has been deleted.");

        return Command::SUCCESS;
    }

    private function resetPassword(): int
    {
        $email = $this->option('email') ?: $this->ask('Enter admin email');
        $password = $this->option('password') ?: $this->secret('Enter new password');

        $admin = Admin::where('email', $email)->first();

        if (!$admin) {
            $this->error("Admin with email {$email} not found.");
            return Command::FAILURE;
        }

        $admin->update(['password' => Hash::make($password)]);
        
        // Revoke existing tokens to force re-login
        $admin->tokens()->delete();

        $this->info("Password reset successfully for {$email}.");

        return Command::SUCCESS;
    }

    private function listAdmins(): int
    {
        $admins = Admin::all(['id', 'name', 'email', 'created_at']);

        if ($admins->isEmpty()) {
            $this->warn('No admin accounts found.');
            return Command::SUCCESS;
        }

        $this->info('Admin accounts:');
        $this->table(
            ['ID', 'Name', 'Email', 'Created At'],
            $admins->map(fn($a) => [$a->id, $a->name, $a->email, $a->created_at->format('Y-m-d H:i')])
        );

        return Command::SUCCESS;
    }

    private function invalidAction(): int
    {
        $this->error('Invalid action. Use: create, delete, list, or reset-password');
        return Command::FAILURE;
    }
}
