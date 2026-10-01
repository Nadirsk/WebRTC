<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('usage_daily', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('sessions')->default(0);
            $table->decimal('total_minutes', 12, 2)->default(0);
            $table->decimal('video_minutes', 12, 2)->default(0);
            $table->decimal('audio_minutes', 12, 2)->default(0);
            /** Per-channel {channel, sessions, minutes} breakdown, straight from the orchestrator. */
            $table->json('channels')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('usage_daily');
    }
};
