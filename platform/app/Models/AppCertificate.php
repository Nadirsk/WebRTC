<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class AppCertificate extends Model
{
    /** created_at only (set by the database); there is no updated_at column. */
    public $timestamps = false;

    protected $fillable = ['project_id', 'secret', 'is_primary'];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** 32 lowercase hex characters, used as the HMAC-SHA256 key for access tokens. */
    public static function generateSecret(): string
    {
        return Str::lower(bin2hex(random_bytes(16)));
    }
}
