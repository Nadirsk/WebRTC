<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\AuthorizesOrganization;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Project;
use App\Models\Webhook;
use Illuminate\Http\Request;

/** Configuration for a project's webhooks. Delivery itself lives in App\Jobs\DeliverWebhook. */
class WebhookController extends Controller
{
    use AuthorizesOrganization;

    private const EVENTS = ['channel.created', 'channel.destroyed', 'user.joined', 'user.left'];

    public function index(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization);
        abort_unless($project->organization_id === $organization->id, 404);

        return response()->json(['webhooks' => $project->webhooks]);
    }

    public function store(Request $request, Organization $organization, Project $project)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin', 'developer']);
        abort_unless($project->organization_id === $organization->id, 404);

        $data = $request->validate([
            'url' => ['required', 'url', 'max:2048'],
            'events' => ['nullable', 'array'],
            'events.*' => ['in:'.implode(',', self::EVENTS)],
        ]);

        $webhook = $project->webhooks()->create([
            'url' => $data['url'],
            'secret' => Webhook::generateSecret(),
            'events' => $data['events'] ?? null,
        ]);

        return response()->json(['webhook' => $webhook], 201);
    }

    public function update(Request $request, Organization $organization, Project $project, Webhook $webhook)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin', 'developer']);
        abort_unless($project->organization_id === $organization->id && $webhook->project_id === $project->id, 404);

        $data = $request->validate([
            'url' => ['sometimes', 'url', 'max:2048'],
            'events' => ['sometimes', 'nullable', 'array'],
            'events.*' => ['in:'.implode(',', self::EVENTS)],
            'active' => ['sometimes', 'boolean'],
        ]);

        $webhook->update($data);

        return response()->json(['webhook' => $webhook]);
    }

    public function destroy(Request $request, Organization $organization, Project $project, Webhook $webhook)
    {
        $this->authorizeMembership($request->user(), $organization, ['owner', 'admin']);
        abort_unless($project->organization_id === $organization->id && $webhook->project_id === $project->id, 404);

        $webhook->delete();

        return response()->noContent();
    }

    public function deliveries(Request $request, Organization $organization, Project $project, Webhook $webhook)
    {
        $this->authorizeMembership($request->user(), $organization);
        abort_unless($project->organization_id === $organization->id && $webhook->project_id === $project->id, 404);

        return response()->json(['deliveries' => $webhook->deliveries()->latest()->limit(50)->get()]);
    }
}
