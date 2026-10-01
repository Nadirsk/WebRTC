<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AuthorizesOrganization;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class OrganizationController extends Controller
{
    use AuthorizesOrganization;

    /** Organizations the current user belongs to, with their role in each. */
    public function index(Request $request)
    {
        return response()->json(['organizations' => $request->user()->organizations]);
    }

    public function show(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization);

        return response()->json(['organization' => $organization]);
    }

    public function members(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization);

        return response()->json(['members' => $organization->users()->get(['users.id', 'users.name', 'users.email'])]);
    }

    /** Add an existing registered user to the organization. */
    public function addMember(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);

        $data = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'in:owner,admin,developer,billing'],
        ]);

        $member = User::where('email', $data['email'])->first();
        if (! $member) {
            throw ValidationException::withMessages(['email' => 'No user is registered with that email yet.']);
        }
        if ($organization->users()->where('users.id', $member->id)->exists()) {
            throw ValidationException::withMessages(['email' => 'This person is already a member.']);
        }

        $organization->users()->attach($member->id, ['role' => $data['role']]);

        return response()->json(['member' => ['id' => $member->id, 'name' => $member->name, 'email' => $member->email, 'role' => $data['role']]], 201);
    }

    public function removeMember(Request $request, Organization $organization, User $member)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);

        $isLastOwner = $member->roleIn($organization) === 'owner'
            && $organization->users()->wherePivot('role', 'owner')->count() <= 1;
        if ($isLastOwner) {
            throw ValidationException::withMessages(['member' => 'An organization needs at least one owner.']);
        }

        $organization->users()->detach($member->id);

        return response()->noContent();
    }
}
