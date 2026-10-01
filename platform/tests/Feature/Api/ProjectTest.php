<?php

namespace Tests\Feature\Api;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectTest extends TestCase
{
    use RefreshDatabase;

    private function memberOf(Organization $organization, string $role = 'owner'): User
    {
        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['role' => $role]);

        return $user;
    }

    public function test_creating_a_project_generates_an_app_id_and_a_certificate(): void
    {
        $organization = Organization::factory()->create();
        $user = $this->memberOf($organization);

        $response = $this->actingAs($user)->postJson("/api/organizations/{$organization->id}/projects", [
            'name' => 'Acme Chat',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('project.name', 'Acme Chat');
        $response->assertJsonPath('project.auth_mode', 'token');
        $response->assertJsonCount(1, 'project.certificates');

        $appId = $response->json('project.app_id');
        $this->assertMatchesRegularExpression('/^[a-f0-9]{32}$/', $appId);

        $secret = $response->json('project.certificates.0.secret');
        $this->assertMatchesRegularExpression('/^[a-f0-9]{32}$/', $secret);
    }

    public function test_a_testing_mode_project_has_no_certificate(): void
    {
        $organization = Organization::factory()->create();
        $user = $this->memberOf($organization);

        $response = $this->actingAs($user)->postJson("/api/organizations/{$organization->id}/projects", [
            'name' => 'Sandbox',
            'auth_mode' => 'appIdOnly',
        ]);

        $response->assertCreated()->assertJsonCount(0, 'project.certificates');
    }

    public function test_two_projects_never_share_an_app_id(): void
    {
        $organization = Organization::factory()->create();
        $a = Project::generateAppId();
        $b = Project::generateAppId();

        $this->assertNotSame($a, $b);
    }

    public function test_rotating_the_certificate_keeps_the_old_one_as_secondary(): void
    {
        $organization = Organization::factory()->create();
        $user = $this->memberOf($organization);
        $project = Project::factory()->for($organization)->create();
        $original = $project->certificates()->create(['secret' => \App\Models\AppCertificate::generateSecret(), 'is_primary' => true]);

        $response = $this->actingAs($user)->postJson("/api/organizations/{$organization->id}/projects/{$project->id}/rotate-certificate");

        $response->assertOk()->assertJsonCount(2, 'project.certificates');
        $secrets = collect($response->json('project.certificates'));
        $this->assertTrue($secrets->firstWhere('is_primary', false)['secret'] === $original->secret);
        $newPrimary = $secrets->firstWhere('is_primary', true);
        $this->assertNotSame($original->secret, $newPrimary['secret']);

        // Dropping the secondary leaves only the new primary.
        $this->actingAs($user)
            ->deleteJson("/api/organizations/{$organization->id}/projects/{$project->id}/secondary-certificate")
            ->assertOk()
            ->assertJsonCount(1, 'project.certificates');
    }

    public function test_a_project_from_another_organization_is_not_visible(): void
    {
        $organization = Organization::factory()->create();
        $user = $this->memberOf($organization);
        $otherOrgProject = Project::factory()->create();

        $this->actingAs($user)
            ->getJson("/api/organizations/{$organization->id}/projects/{$otherOrgProject->id}")
            ->assertNotFound();
    }

    public function test_a_developer_cannot_delete_a_project(): void
    {
        $organization = Organization::factory()->create();
        $developer = $this->memberOf($organization, 'developer');
        $project = Project::factory()->for($organization)->create();

        $this->actingAs($developer)
            ->deleteJson("/api/organizations/{$organization->id}/projects/{$project->id}")
            ->assertForbidden();
    }

    public function test_the_demo_project_cannot_be_deleted(): void
    {
        $organization = Organization::factory()->create();
        $owner = $this->memberOf($organization);
        $project = Project::factory()->for($organization)->demo()->create();

        $this->actingAs($owner)
            ->deleteJson("/api/organizations/{$organization->id}/projects/{$project->id}")
            ->assertUnprocessable();
    }

    public function test_suspending_a_project_reflects_in_the_allocator_shape(): void
    {
        $organization = Organization::factory()->create();
        $user = $this->memberOf($organization);
        $project = Project::factory()->for($organization)->create();
        $project->certificates()->create(['secret' => \App\Models\AppCertificate::generateSecret(), 'is_primary' => true]);

        $this->actingAs($user)
            ->patchJson("/api/organizations/{$organization->id}/projects/{$project->id}", ['status' => 'suspended'])
            ->assertOk()
            ->assertJsonPath('project.status', 'suspended');

        $this->assertSame('suspended', $project->fresh()->toAllocatorArray()['status']);
    }

    public function test_suspending_the_organization_also_suspends_its_projects_for_the_network(): void
    {
        $organization = Organization::factory()->create();
        $project = Project::factory()->for($organization)->create();
        $project->certificates()->create(['secret' => \App\Models\AppCertificate::generateSecret(), 'is_primary' => true]);

        $organization->update(['status' => 'suspended']);

        $this->assertSame('suspended', $project->fresh()->toAllocatorArray()['status']);
    }
}
