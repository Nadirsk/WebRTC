<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            // 32 lowercase hex characters, matches shared/auth.ts APP_ID_PATTERN.
            $table->char('app_id', 32)->unique();
            $table->enum('status', ['active', 'suspended'])->default('active');
            // token: every join needs an access token. appIdOnly: testing mode.
            $table->enum('auth_mode', ['token', 'appIdOnly'])->default('token');
            // The public demo project the website and test pages use. At most one across all orgs.
            $table->boolean('is_demo')->default(false);
            $table->unsignedInteger('max_concurrent_users')->default(100);
            $table->unsignedInteger('max_channels')->default(20);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
