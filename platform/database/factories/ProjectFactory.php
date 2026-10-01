<?php

namespace Database\Factories;

use App\Models\Organization;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Project>
 */
class ProjectFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => Organization::factory(),
            'name' => $this->faker->words(2, true),
            'app_id' => Project::generateAppId(),
            'status' => 'active',
            'auth_mode' => 'token',
            'is_demo' => false,
            'max_concurrent_users' => 1000,
            'max_channels' => 200,
        ];
    }

    public function testingMode(): static
    {
        return $this->state(['auth_mode' => 'appIdOnly']);
    }

    public function demo(): static
    {
        return $this->state(['is_demo' => true, 'auth_mode' => 'appIdOnly']);
    }

    public function suspended(): static
    {
        return $this->state(['status' => 'suspended']);
    }
}
