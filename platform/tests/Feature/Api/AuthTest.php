<?php

namespace Tests\Feature\Api;

use App\Models\Invite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_sign_up_with_a_valid_invite_creates_an_owner_and_organization(): void
    {
        $invite = Invite::factory()->create();

        $response = $this->postJson('/api/register', [
            'name' => 'Ayesha Khan',
            'email' => 'ayesha@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'organization_name' => 'Acme Chat',
            'invite_code' => $invite->code,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('users', ['email' => 'ayesha@example.com']);
        $this->assertDatabaseHas('organizations', ['name' => 'Acme Chat']);

        $user = User::where('email', 'ayesha@example.com')->firstOrFail();
        $organization = $user->organizations()->firstOrFail();
        $this->assertSame('owner', $user->roleIn($organization));

        $this->assertTrue($invite->fresh()->used_at !== null);
    }

    public function test_sign_up_is_refused_without_a_valid_invite_code(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Ayesha Khan',
            'email' => 'ayesha@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'organization_name' => 'Acme Chat',
            'invite_code' => 'NOT-A-REAL-CODE',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['invite_code']);
        $this->assertDatabaseMissing('users', ['email' => 'ayesha@example.com']);
    }

    public function test_an_invite_cannot_be_used_twice(): void
    {
        $invite = Invite::factory()->used()->create();

        $response = $this->postJson('/api/register', [
            'name' => 'Second User',
            'email' => 'second@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'organization_name' => 'Second Org',
            'invite_code' => $invite->code,
        ]);

        $response->assertUnprocessable();
    }

    public function test_an_invite_tied_to_an_email_refuses_a_different_email(): void
    {
        $invite = Invite::factory()->create(['email' => 'reserved@example.com']);

        $response = $this->postJson('/api/register', [
            'name' => 'Someone Else',
            'email' => 'someone-else@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'organization_name' => 'Org',
            'invite_code' => $invite->code,
        ]);

        $response->assertUnprocessable();
    }

    public function test_login_and_logout(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $login = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password123']);
        $login->assertOk()->assertJsonPath('user.email', $user->email);

        $this->postJson('/api/logout')->assertNoContent();
    }

    public function test_login_fails_with_the_wrong_password(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertUnprocessable();
    }

    public function test_login_from_the_console_origin_starts_a_cookie_session(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this->withHeader('Origin', 'http://localhost:3200')
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'password123']);

        $response->assertOk();
        $response->assertCookie(config('session.cookie'));
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/user')->assertUnauthorized();

        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/user')->assertOk()->assertJsonPath('user.email', $user->email);
    }
}
