<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_certificates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            // 32 lowercase hex characters. Shown to the customer once; used as the HMAC key for tokens.
            $table->char('secret', 32);
            // At most one primary and one secondary per project (secondary only exists during rotation).
            $table->boolean('is_primary')->default(true);
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_certificates');
    }
};
