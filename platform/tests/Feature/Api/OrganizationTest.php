<?php

namespace Tests\Feature\Api;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrganizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_can_list_their_organizations(): void
    {
        $user = User::factory()->create();
        $organization = Organization::factory()->create();
        $organization->users()->attach($user->id, ['role' => 'owner']);

        $this->actingAs($user)->getJson('/api/organizations')
            ->assertOk()
            ->assertJsonCount(1, 'organizations')
            ->assertJsonPath('organizations.0.id', $organization->id);
    }

    public function test_a_non_member_cannot_see_the_organization(): void
    {
        $user = User::factory()->create();
        $organization = Organization::factory()->create();

        $this->actingAs($user)->getJson("/api/organizations/{$organization->id}")->assertForbidden();
    }

    public function test_an_admin_can_add_an_existing_user_as_a_member(): void
    {
        $admin = User::factory()->create();
        $newMember = User::factory()->create();
        $organization = Organization::factory()->create();
        $organization->users()->attach($admin->id, ['role' => 'admin']);

        $response = $this->actingAs($admin)->postJson("/api/organizations/{$organization->id}/members", [
            'email' => $newMember->email,
            'role' => 'developer',
        ]);

        $response->assertCreated();
        $this->assertSame('developer', $newMember->roleIn($organization->fresh()));
    }

    public function test_a_developer_cannot_add_members(): void
    {
        $developer = User::factory()->create();
        $organization = Organization::factory()->create();
        $organization->users()->attach($developer->id, ['role' => 'developer']);

        $this->actingAs($developer)->postJson("/api/organizations/{$organization->id}/members", [
            'email' => 'someone@example.com',
            'role' => 'developer',
        ])->assertForbidden();
    }

    public function test_the_last_owner_cannot_be_removed(): void
    {
        $owner = User::factory()->create();
        $organization = Organization::factory()->create();
        $organization->users()->attach($owner->id, ['role' => 'owner']);

        $this->actingAs($owner)->deleteJson("/api/organizations/{$organization->id}/members/{$owner->id}")
            ->assertUnprocessable();
    }
}
