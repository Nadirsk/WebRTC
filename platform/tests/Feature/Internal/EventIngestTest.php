<?php

namespace Tests\Feature\Internal;

use App\Jobs\DeliverWebhook;
use App\Models\Project;
use App\Models\Webhook;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class EventIngestTest extends TestCase
{
    use RefreshDatabase;

    public function test_webhook_dispatch()
    {
        Queue::fake();

        $project = Project::factory()->create(['app_id' => 'testapp123']);
        $webhook = Webhook::factory()->create([
            'project_id' => $project->id,
            'active' => true,
            'events' => ['channel.created']
        ]);

        $response = $this->withHeaders([
            'x-cluster-secret' => config('services.cluster.secret')
        ])->postJson('/api/internal/events', [
            'type' => 'channel.created',
            'appId' => 'testapp123',
            'channel' => 'chan1',
        ]);

        $response->assertStatus(202);
        
        Queue::assertPushed(DeliverWebhook::class, function ($job) use ($webhook) {
            return $job->webhookId === $webhook->id;
        });
    }
}
