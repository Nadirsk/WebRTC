<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One project's total usage for one day, rolled up from the orchestrator, with a per-channel breakdown. */
class UsageDaily extends Model
{
    protected $table = 'usage_daily';

    protected $fillable = [
        'project_id', 'date', 'sessions', 'total_minutes', 'video_minutes', 'audio_minutes', 'channels',
    ];

    protected function casts(): array
    {
        return [
            // Deliberately not cast to 'date': that cast reformats the value on save (to a full
            // datetime string), which then no longer matches the plain Y-m-d string that lookups
            // (e.g. updateOrCreate's where()) compare against. Kept a plain string, always Y-m-d.
            'total_minutes' => 'float',
            'video_minutes' => 'float',
            'audio_minutes' => 'float',
            'channels' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
