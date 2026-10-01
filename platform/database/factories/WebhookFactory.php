<?php

namespace Database\Factories;

use App\Models\Project;
use App\Models\Webhook;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Webhook>
 */
class WebhookFactory extends Factory
{
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'url' => $this->faker->url(),
            'secret' => Webhook::generateSecret(),
            'events' => [],
            'active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
