<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A customer's project: an App ID, its certificate(s), and the limits and mode the allocator
 * enforces. See allocator/src/projects.ts for the shape the network expects.
 */
class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'organization_id', 'name', 'app_id', 'status', 'auth_mode',
        'is_demo', 'max_concurrent_users', 'max_channels',
    ];

    protected function casts(): array
    {
        return [
            'is_demo' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(AppCertificate::class)->orderByDesc('is_primary')->orderBy('created_at');
    }

    public function webhooks(): HasMany
    {
        return $this->hasMany(Webhook::class);
    }

    public function usageDaily(): HasMany
    {
        return $this->hasMany(UsageDaily::class);
    }

    public function primaryCertificate(): ?AppCertificate
    {
        return $this->certificates->firstWhere('is_primary', true);
    }

    /** Suspended by its own status, or because its organization is suspended. */
    public function isEffectivelySuspended(): bool
    {
        return $this->status === 'suspended' || $this->organization->isSuspended();
    }

    /** 32 lowercase hex characters, unique across every project. Matches shared/auth.ts APP_ID_PATTERN. */
    public static function generateAppId(): string
    {
        do {
            $appId = Str::lower(bin2hex(random_bytes(16)));
        } while (static::where('app_id', $appId)->exists());

        return $appId;
    }

    /** The shape the allocator's project store expects (see allocator/src/projects.ts). */
    public function toAllocatorArray(): array
    {
        return [
            'appId' => $this->app_id,
            'name' => $this->name,
            'status' => $this->isEffectivelySuspended() ? 'suspended' : 'active',
            'authMode' => $this->auth_mode,
            'certificates' => $this->certificates->pluck('secret')->values()->all(),
            'demo' => $this->is_demo,
            'limits' => [
                'maxConcurrentUsers' => $this->max_concurrent_users,
                'maxChannels' => $this->max_channels,
            ],
        ];
    }
}
