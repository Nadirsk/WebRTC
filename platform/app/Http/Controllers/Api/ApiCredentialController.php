<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AuthorizesOrganization;
use App\Http\Controllers\Controller;
use App\Models\ApiCredential;
use App\Models\Organization;
use Illuminate\Http\Request;

class ApiCredentialController extends Controller
{
    use AuthorizesOrganization;

    public function index(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization);

        return response()->json(['credentials' => $organization->apiCredentials()->latest()->get()]);
    }

    /** The secret is returned once, here, and never again. */
    public function store(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin', 'developer']);

        $data = $request->validate(['label' => ['nullable', 'string', 'max:255']]);
        [$credential, $secret] = ApiCredential::generateFor($organization, $data['label'] ?? 'Default');

        return response()->json(['credential' => $credential, 'secret' => $secret], 201);
    }

    public function destroy(Request $request, Organization $organization, ApiCredential $credential)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);
        abort_unless($credential->organization_id === $organization->id, 404);

        $credential->delete();

        return response()->noContent();
    }
}
