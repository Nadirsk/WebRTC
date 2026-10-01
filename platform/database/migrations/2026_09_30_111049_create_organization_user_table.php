<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // owner: full control, only owner can delete the org or remove another owner.
            // admin: manage projects, keys, webhooks, members (except owners).
            // developer: manage projects and keys, no billing or member management.
            // billing: usage and billing only, read-only elsewhere.
            $table->enum('role', ['owner', 'admin', 'developer', 'billing'])->default('developer');
            $table->timestamps();
            $table->unique(['organization_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_user');
    }
};
