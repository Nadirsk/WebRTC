<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Organization;
use App\Models\User;

trait AuthorizesOrganization
{
    /** Aborts with 403 unless the user belongs to the organization, optionally in one of `$roles`. */
    protected function authorizeMembership(User $user, Organization $organization, array $roles = []): string
    {
        $role = $user->roleIn($organization);
        if ($role === null || ($roles !== [] && ! in_array($role, $roles, true))) {
            abort(403, 'You are not allowed to do this in this organization.');
        }

        return $role;
    }
}
