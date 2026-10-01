<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invite;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Sign up: creates the user, a new organization owned by them, and consumes an invite code. */
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'organization_name' => ['required', 'string', 'max:255'],
            'invite_code' => ['required', 'string'],
        ]);

        $invite = Invite::where('code', $data['invite_code'])->first();
        if (! $invite || ! $invite->isValid()) {
            throw ValidationException::withMessages([
                'invite_code' => 'This invite code is invalid or has already been used.',
            ]);
        }
        if ($invite->email !== null && strcasecmp($invite->email, $data['email']) !== 0) {
            throw ValidationException::withMessages([
                'invite_code' => 'This invite code was issued for a different email address.',
            ]);
        }

        $user = DB::transaction(function () use ($data, $invite) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
            ]);

            $organization = Organization::create([
                'name' => $data['organization_name'],
                'slug' => Organization::makeSlug($data['organization_name']),
            ]);
            $organization->users()->attach($user->id, ['role' => 'owner']);

            $invite->forceFill(['used_at' => now(), 'organization_id' => $organization->id])->save();

            return $user;
        });

        Auth::login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json(['user' => $user->load('organizations')], 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($data, remember: true)) {
            throw ValidationException::withMessages(['email' => 'These credentials do not match our records.']);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json(['user' => $request->user()->load('organizations')]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    public function me(Request $request)
    {
        return response()->json(['user' => $request->user()->load('organizations')]);
    }
}
