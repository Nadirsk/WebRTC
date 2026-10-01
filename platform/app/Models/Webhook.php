<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Webhook extends Model
{
    use HasFactory;
    protected $fillable = ['project_id', 'url', 'secret', 'events', 'active'];

    protected function casts(): array
    {
        return [
            'events' => 'array',
            'active' => 'boolean',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class);
    }

    /** An empty or missing event list means "send everything". */
    public function appliesTo(string $event): bool
    {
        return $this->active && (empty($this->events) || in_array($event, $this->events, true));
    }

    public static function generateSecret(): string
    {
        return Str::random(40);
    }
}
