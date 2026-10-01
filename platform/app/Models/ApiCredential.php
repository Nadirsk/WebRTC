<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * A key/secret pair for the REST API (distinct from a project's App Certificate, which signs
 * access tokens). The secret is hashed with SHA-256, not bcrypt: it is checked on every REST
 * call, so it needs to be fast, and it is high-entropy already so bcrypt's slow hashing buys
 * nothing extra.
 */
class ApiCredential extends Model
{
    use HasFactory;
    protected $fillable = ['organization_id', 'label', 'key', 'secret_hash', 'last_used_at'];

    protected $hidden = ['secret_hash'];

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public static function hashSecret(string $secret): string
    {
        return hash('sha256', $secret);
    }

    public function matchesSecret(string $secret): bool
    {
        return hash_equals($this->secret_hash, self::hashSecret($secret));
    }

    /** Returns [model, plainSecret]. The plain secret is shown once and never stored. */
    public static function generateFor(Organization $organization, string $label = 'Default'): array
    {
        $key = Str::lower(bin2hex(random_bytes(12)));
        $secret = Str::lower(bin2hex(random_bytes(20)));
        $credential = $organization->apiCredentials()->create([
            'label' => $label,
            'key' => $key,
            'secret_hash' => self::hashSecret($secret),
        ]);

        return [$credential, $secret];
    }
}
