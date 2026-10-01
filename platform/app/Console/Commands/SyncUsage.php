<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Models\UsageDaily;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Pulls each project's usage for a day from the orchestrator and rolls it into usage_daily. */
class SyncUsage extends Command
{
    protected $signature = 'usage:sync {--date= : A single day (Y-m-d, UTC) to sync instead of today and yesterday}';

    protected $description = 'Sync per-project usage from the orchestrator into usage_daily';

    public function handle(): int
    {
        $dates = $this->option('date')
            ? [Carbon::parse($this->option('date'), 'UTC')->startOfDay()]
            : [Carbon::now('UTC')->startOfDay(), Carbon::now('UTC')->subDay()->startOfDay()];

        $projects = Project::all();
        $this->info("Syncing usage for {$projects->count()} project(s) across ".count($dates).' day(s).');

        foreach ($projects as $project) {
            foreach ($dates as $day) {
                $this->syncOne($project, $day);
            }
        }

        return self::SUCCESS;
    }

    private function syncOne(Project $project, Carbon $day): void
    {
        $from = $day->clone()->startOfDay();
        $to = $day->clone()->addDay()->startOfDay();

        $response = Http::withHeaders(['x-cluster-secret' => config('services.cluster.secret')])
            ->timeout(10)
            ->get(rtrim(config('services.cluster.orchestrator_url'), '/').'/internal/usage', [
                'appId' => $project->app_id,
                'from' => $from->valueOf(),
                'to' => $to->valueOf(),
            ]);

        if (! $response->successful()) {
            Log::warning('usage sync failed for a project', [
                'appId' => $project->app_id,
                'date' => $from->toDateString(),
                'status' => $response->status(),
            ]);
            $this->warn("  {$project->app_id} {$from->toDateString()}: orchestrator returned {$response->status()}");

            return;
        }

        $usage = $response->json();

        UsageDaily::updateOrCreate(
            ['project_id' => $project->id, 'date' => $from->toDateString()],
            [
                'sessions' => $usage['sessions'] ?? 0,
                'total_minutes' => $usage['totalMinutes'] ?? 0,
                'video_minutes' => $usage['videoMinutes'] ?? 0,
                'audio_minutes' => $usage['audioMinutes'] ?? 0,
                'channels' => $usage['byChannel'] ?? [],
            ],
        );
    }
}
