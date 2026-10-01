<?php

namespace Tests\Feature\Api\V1;

use App\Models\ApiCredential;
use App\Models\Organization;
use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChannelControllerTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;
    private Project $project;
    private ApiCredential $credential;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->org = Organization::factory()->create();
        $this->project = Project::factory()->create([
            'organization_id' => $this->org->id,
            'app_id' => 'testapp123'
        ]);
        
        $this->credential = ApiCredential::factory()->create([
            'organization_id' => $this->org->id,
        ]);
        
        $secret = \Illuminate\Support\Str::random(40);
        $this->credential->forceFill(['secret_hash' => hash('sha256', $secret)])->save();
        $this->token = $this->credential->key . ':' . $secret;
        
        Http::preventStrayRequests();
    }

    public function test_index_channels()
    {
        Http::fake([
            '*/internal/channels*' => Http::response(['data' => ['channel1']], 200)
        ]);

        $response = $this->withHeaders(['Authorization' => 'Bearer ' . $this->token])
            ->getJson('/api/v1/channels');

        $response->assertStatus(200)
            ->assertJson(['data' => ['channel1']]);
    }

    public function test_kick_user()
    {
        Http::fake([
            '*/internal/channels/chan1/kick' => Http::response(['success' => true], 200)
        ]);

        $response = $this->withHeaders(['Authorization' => 'Bearer ' . $this->token])
            ->postJson('/api/v1/channels/chan1/kick', [
                'appId' => $this->project->app_id,
                'uid' => 'user1'
            ]);

        $response->assertStatus(200)
            ->assertJson(['success' => true]);
    }
}
