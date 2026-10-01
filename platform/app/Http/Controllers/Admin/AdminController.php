<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use App\Models\UsageDaily;
use Illuminate\Http\Request;
use Carbon\Carbon;

class AdminController extends Controller
{
    public function organizations()
    {
        $organizations = Organization::withCount(['projects', 'members'])->get();
        return response()->json(['data' => $organizations]);
    }

    public function organizationShow(Organization $organization)
    {
        return response()->json([
            'data' => $organization->load(['members', 'projects'])
        ]);
    }

    public function organizationUpdate(Request $request, Organization $organization)
    {
        $validated = $request->validate([
            'status' => 'sometimes|string|in:active,suspended',
            'admin_note' => 'nullable|string'
        ]);

        $organization->update($validated);

        return response()->json(['data' => $organization]);
    }

    public function projects()
    {
        $projects = Project::with('organization:id,name')
            ->withCount('usageDaily')
            ->get();
            
        return response()->json(['data' => $projects]);
    }

    public function projectUpdate(Request $request, Project $project)
    {
        $validated = $request->validate([
            'status' => 'sometimes|string|in:active,suspended',
            'admin_note' => 'nullable|string'
        ]);

        $project->update($validated);

        return response()->json(['data' => $project]);
    }

    public function stats()
    {
        $today = Carbon::today()->toDateString();
        $todayMinutes = UsageDaily::where('date', $today)->sum('minutes');

        return response()->json([
            'data' => [
                'total_organizations' => Organization::count(),
                'total_projects' => Project::count(),
                'total_users' => User::count(),
                'today_minutes' => $todayMinutes,
            ]
        ]);
    }
}
