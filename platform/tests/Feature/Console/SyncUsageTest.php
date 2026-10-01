<?php

namespace Tests\Feature\Console;

use App\Models\Project;
use App\Models\UsageDaily;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SyncUsageTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_rolls_orchestrator_usage_into_usage_daily(): void
    {
        $project = Project::factory()->create();

        Http::fake([
            '*/internal/usage*' => Http::response([
                'appId' => $project->app_id,
                'from' => 0,
                'to' => 0,
                'sessions' => 3,
                'totalMinutes' => 12.5,
                'videoMinutes' => 8.25,
                'audioMinutes' => 4.25,
                'byChannel' => [
                    ['channel' => 'lobby', 'sessions' => 2, 'minutes' => 9.0],
                    ['channel' => 'stage', 'sessions' => 1, 'minutes' => 3.5],
                ],
            ], 200),
        ]);

        $this->artisan('usage:sync', ['--date' => '2026-09-30'])->assertSuccessful();

        Http::assertSent(function ($request) use ($project) {
            return $request['appId'] === $project->app_id
                && str_contains((string) $request->url(), '/internal/usage')
                && $request->hasHeader('x-cluster-secret', config('services.cluster.secret'));
        });

        $row = UsageDaily::where('project_id', $project->id)->where('date', '2026-09-30')->firstOrFail();
        $this->assertSame(3, $row->sessions);
        $this->assertEquals(12.5, $row->total_minutes);
        $this->assertEquals(8.25, $row->video_minutes);
        $this->assertEquals(4.25, $row->audio_minutes);
        $this->assertCount(2, $row->channels);
        $this->assertSame('lobby', $row->channels[0]['channel']);
    }

    public function test_running_it_twice_updates_the_same_row_instead_of_duplicating(): void
    {
        $project = Project::factory()->create();

        Http::fake([
            '*/internal/usage*' => Http::sequence()
                ->push(['sessions' => 1, 'totalMinutes' => 5, 'videoMinutes' => 0, 'audioMinutes' => 5, 'byChannel' => []])
                ->push(['sessions' => 4, 'totalMinutes' => 20, 'videoMinutes' => 10, 'audioMinutes' => 10, 'byChannel' => []]),
        ]);
        $this->artisan('usage:sync', ['--date' => '2026-09-30']);
        $this->artisan('usage:sync', ['--date' => '2026-09-30']);

        $this->assertSame(1, UsageDaily::where('project_id', $project->id)->count());
        $this->assertEquals(20, UsageDaily::where('project_id', $project->id)->first()->total_minutes);
    }

    public function test_with_no_date_option_it_syncs_today_and_yesterday_for_every_project(): void
    {
        Project::factory()->count(2)->create();

        Http::fake(['*/internal/usage*' => Http::response(['sessions' => 0, 'totalMinutes' => 0, 'videoMinutes' => 0, 'audioMinutes' => 0, 'byChannel' => []], 200)]);

        $this->artisan('usage:sync')->assertSuccessful();

        $this->assertSame(4, UsageDaily::count());
        Http::assertSentCount(4);
    }

    public function test_an_orchestrator_error_for_one_project_does_not_stop_the_rest(): void
    {
        $bad = Project::factory()->create();
        $good = Project::factory()->create();

        Http::fake([
            '*appId='.$bad->app_id.'*' => Http::response(['message' => 'boom'], 500),
            '*appId='.$good->app_id.'*' => Http::response(['sessions' => 1, 'totalMinutes' => 1, 'videoMinutes' => 0, 'audioMinutes' => 1, 'byChannel' => []], 200),
        ]);

        $this->artisan('usage:sync', ['--date' => '2026-09-30'])->assertSuccessful();

        $this->assertSame(0, UsageDaily::where('project_id', $bad->id)->count());
        $this->assertSame(1, UsageDaily::where('project_id', $good->id)->count());
    }
}
