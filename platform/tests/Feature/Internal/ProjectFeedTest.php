<?php

namespace Tests\Feature\Internal;

use App\Models\AppCertificate;
use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectFeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_requires_the_cluster_secret(): void
    {
        $this->getJson('/api/internal/projects')->assertUnauthorized();

        $this->withHeaders(['x-cluster-secret' => 'wrong'])
            ->getJson('/api/internal/projects')
            ->assertUnauthorized();
    }

    public function test_it_returns_projects_in_the_shape_the_allocator_expects(): void
    {
        $project = Project::factory()->create(['name' => 'Acme Chat']);
        $project->certificates()->create(['secret' => AppCertificate::generateSecret(), 'is_primary' => true]);

        $response = $this->withHeaders(['x-cluster-secret' => config('services.cluster.secret')])
            ->getJson('/api/internal/projects');

        $response->assertOk();
        $data = collect($response->json('projects'))->firstWhere('appId', $project->app_id);
        $this->assertNotNull($data);
        $this->assertSame('Acme Chat', $data['name']);
        $this->assertSame('active', $data['status']);
        $this->assertSame('token', $data['authMode']);
        $this->assertCount(1, $data['certificates']);
        $this->assertSame(1000, $data['limits']['maxConcurrentUsers']);
    }

    public function test_a_suspended_project_is_reported_suspended(): void
    {
        Project::factory()->suspended()->create();

        $response = $this->withHeaders(['x-cluster-secret' => config('services.cluster.secret')])
            ->getJson('/api/internal/projects');

        $response->assertOk();
        $this->assertTrue(collect($response->json('projects'))->every(fn ($p) => in_array($p['status'], ['active', 'suspended'], true)));
        $this->assertTrue(collect($response->json('projects'))->contains('status', 'suspended'));
    }
}
