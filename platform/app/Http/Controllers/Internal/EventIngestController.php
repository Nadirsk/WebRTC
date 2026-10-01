<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Jobs\DeliverWebhook;
use App\Models\Project;
use Illuminate\Http\Request;

class EventIngestController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|string',
            'appId' => 'required|string',
            'channel' => 'required|string',
            'uid' => 'nullable|string',
            'timestamp' => 'nullable|integer'
        ]);

        $project = Project::where('app_id', $validated['appId'])->first();

        if ($project) {
            $webhooks = $project->webhooks()->where('active', true)->get();

            foreach ($webhooks as $webhook) {
                if ($webhook->appliesTo($validated['type'])) {
                    DeliverWebhook::dispatch($webhook->id, $validated['type'], $validated);
                }
            }
        }

        return response()->json(['status' => 'accepted'], 202);
    }
}
