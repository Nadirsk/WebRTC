<?php

namespace Database\Factories;

use App\Models\ApiCredential;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ApiCredential>
 */
class ApiCredentialFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'label' => 'Default',
            'key' => Str::lower(bin2hex(random_bytes(12))),
            'secret_hash' => ApiCredential::hashSecret('test-secret'),
        ];
    }
}
