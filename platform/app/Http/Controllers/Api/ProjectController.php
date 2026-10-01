<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AuthorizesOrganization;
use App\Http\Controllers\Controller;
use App\Models\AppCertificate;
use App\Models\Organization;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class ProjectController extends Controller
{
    use AuthorizesOrganization;

    public function index(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization);

        return response()->json(['projects' => $organization->projects()->with('certificates')->latest()->get()]);
    }

    public function store(Request $request, Organization $organization)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin', 'developer']);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'auth_mode' => ['nullable', 'in:token,appIdOnly'],
            'max_concurrent_users' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'max_channels' => ['nullable', 'integer', 'min:1', 'max:1000000'],
        ]);

        $project = $organization->projects()->create([
            'name' => $data['name'],
            'app_id' => Project::generateAppId(),
            'auth_mode' => $data['auth_mode'] ?? 'token',
            'max_concurrent_users' => $data['max_concurrent_users'] ?? 1000,
            'max_channels' => $data['max_channels'] ?? 200,
        ]);

        if ($project->auth_mode === 'token') {
            $project->certificates()->create(['secret' => AppCertificate::generateSecret(), 'is_primary' => true]);
        }

        return response()->json(['project' => $project->fresh('certificates')], 201);
    }

    public function show(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization);
        abort_unless($project->organization_id === $organization->id, 404);

        return response()->json(['project' => $project->load('certificates')]);
    }

    public function update(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin', 'developer']);
        abort_unless($project->organization_id === $organization->id, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'status' => ['sometimes', 'in:active,suspended'],
            'auth_mode' => ['sometimes', 'in:token,appIdOnly'],
            'max_concurrent_users' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
            'max_channels' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
        ]);

        $project->update($data);

        return response()->json(['project' => $project->fresh('certificates')]);
    }

    public function destroy(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);
        abort_unless($project->organization_id === $organization->id, 404);
        abort_if($project->is_demo, 422, 'The demo project cannot be deleted from the console.');

        $project->delete();

        return response()->noContent();
    }

    /** Add a new primary certificate, demoting the current one to secondary during rotation. */
    public function rotateCertificate(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);
        abort_unless($project->organization_id === $organization->id, 404);

        DB::transaction(function () use ($project) {
            $project->certificates()->where('is_primary', false)->delete();
            $project->certificates()->where('is_primary', true)->update(['is_primary' => false]);
            $project->certificates()->create(['secret' => AppCertificate::generateSecret(), 'is_primary' => true]);
        });

        return response()->json(['project' => $project->fresh('certificates')]);
    }

    public function dropSecondaryCertificate(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);
        abort_unless($project->organization_id === $organization->id, 404);

        $project->certificates()->where('is_primary', false)->delete();

        return response()->json(['project' => $project->fresh('certificates')]);
    }

    /** Usage rolled up from the orchestrator (see App\Console\Commands\PullUsage). */
    public function usage(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization);
        abort_unless($project->organization_id === $organization->id, 404);

        $from = $request->date('from') ?? now()->subDays(30)->startOfDay();
        $to = $request->date('to') ?? now()->endOfDay();

        $rows = $project->usageDaily()->whereBetween('date', [$from->toDateString(), $to->toDateString()])->orderBy('date')->get();

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => [
                'sessions' => (int) $rows->sum('sessions'),
                'totalMinutes' => round((float) $rows->sum('total_minutes'), 2),
                'videoMinutes' => round((float) $rows->sum('video_minutes'), 2),
                'audioMinutes' => round((float) $rows->sum('audio_minutes'), 2),
            ],
            'byDay' => $rows,
        ]);
    }

    /** Live snapshot proxied from the orchestrator: how many users are on this project right now. */
    public function live(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization);
        abort_unless($project->organization_id === $organization->id, 404);

        $response = Http::withHeaders(['x-cluster-secret' => config('services.cluster.secret')])
            ->timeout(5)
            ->get(rtrim(config('services.cluster.orchestrator_url'), '/')."/internal/apps/{$project->app_id}/now");

        if (! $response->successful()) {
            return response()->json(['concurrentUsers' => null, 'channels' => null, 'error' => 'Could not reach the network right now.']);
        }

        return response()->json($response->json());
    }
}
