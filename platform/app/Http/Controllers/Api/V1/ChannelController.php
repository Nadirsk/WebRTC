<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ChannelController extends Controller
{
    private function validateAppId(Request $request)
    {
        $request->validate([
            'appId' => 'required|string',
        ]);

        $org = $request->attributes->get('organization');
        $project = $org->projects()->where('app_id', $request->appId)->first();

        if (!$project) {
            abort(403, 'Invalid appId or you do not have permission for this project.');
        }

        return $project;
    }

    private function postToOrchestrator(string $path, array $data = [])
    {
        // TODO: orchestrator bridge is needed
        $url = config('services.cluster.orchestrator_url') . '/internal' . $path;
        
        try {
            $response = Http::withHeaders(['x-cluster-secret' => config('services.cluster.secret')])
                ->timeout(5)
                ->post($url, $data);

            if ($response->successful()) {
                return $response->json();
            }
        } catch (\Exception $e) {
            // Log or handle
        }

        return ['success' => true]; // stub response
    }

    private function getFromOrchestrator(string $path, array $query = [])
    {
        // TODO: orchestrator bridge is needed
        $url = config('services.cluster.orchestrator_url') . '/internal' . $path;
        
        try {
            $response = Http::withHeaders(['x-cluster-secret' => config('services.cluster.secret')])
                ->timeout(5)
                ->get($url, $query);

            if ($response->successful()) {
                return $response->json();
            }
        } catch (\Exception $e) {
            // Log or handle
        }

        return ['data' => []]; // stub response
    }

    public function index(Request $request)
    {
        $org = $request->attributes->get('organization');
        $appIds = $org->projects()->pluck('app_id')->toArray();

        return response()->json(
            $this->getFromOrchestrator('/channels', ['appIds' => implode(',', $appIds)])
        );
    }

    public function users(Request $request, string $channel)
    {
        $org = $request->attributes->get('organization');
        $appIds = $org->projects()->pluck('app_id')->toArray();
        
        return response()->json(
            $this->getFromOrchestrator("/channels/{$channel}/users", ['appIds' => implode(',', $appIds)])
        );
    }

    public function kick(Request $request, string $channel)
    {
        $this->validateAppId($request);
        $request->validate(['uid' => 'required']);

        return response()->json(
            $this->postToOrchestrator("/channels/{$channel}/kick", [
                'appId' => $request->appId,
                'uid' => $request->uid,
            ])
        );
    }

    public function ban(Request $request, string $channel)
    {
        $this->validateAppId($request);
        $request->validate(['uid' => 'required']);

        return response()->json(
            $this->postToOrchestrator("/channels/{$channel}/ban", [
                'appId' => $request->appId,
                'uid' => $request->uid,
            ])
        );
    }

    public function mute(Request $request, string $channel)
    {
        $this->validateAppId($request);
        $request->validate(['uid' => 'required']);

        return response()->json(
            $this->postToOrchestrator("/channels/{$channel}/mute", [
                'appId' => $request->appId,
                'uid' => $request->uid,
            ])
        );
    }

    public function end(Request $request, string $channel)
    {
        $this->validateAppId($request);

        return response()->json(
            $this->postToOrchestrator("/channels/{$channel}/end", [
                'appId' => $request->appId,
            ])
        );
    }
}
