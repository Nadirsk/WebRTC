<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\Project;

/**
 * What the allocator polls instead of config/projects.json (see allocator/src/projects.ts).
 * Protected by the cluster.secret middleware.
 */
class ProjectFeedController extends Controller
{
    public function index()
    {
        $projects = Project::with(['certificates', 'organization'])->get()->map(fn (Project $p) => $p->toAllocatorArray());

        return response()->json(['projects' => $projects->values()]);
    }
}
