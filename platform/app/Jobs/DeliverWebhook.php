<?php

namespace App\Jobs;

use App\Models\Webhook;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;

class DeliverWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $backoff = [0, 30, 300]; // immediate, 30s, 5min
    public $tries = 3;

    public function __construct(
        public int $webhookId,
        public string $event,
        public array $payload
    ) {}

    public function handle(): void
    {
        $webhook = Webhook::find($this->webhookId);
        if (!$webhook || !$webhook->active) {
            return;
        }

        $payloadJson = json_encode($this->payload);
        $signature = hash_hmac('sha256', $payloadJson, $webhook->secret);

        $start = microtime(true);
        $status = 'failed';
        $responseCode = null;
        $responseBody = null;

        try {
            $response = Http::withHeaders([
                'X-Nadir-Signature' => $signature,
                'X-Nadir-Event' => $this->event,
                'Content-Type' => 'application/json'
            ])
            ->timeout(5)
            ->post($webhook->url, $this->payload);

            $responseCode = $response->status();
            $responseBody = $response->body();
            
            if ($response->successful()) {
                $status = 'delivered';
            }
        } catch (\Exception $e) {
            $responseBody = $e->getMessage();
        }

        $latency = (int) ((microtime(true) - $start) * 1000);

        $webhook->deliveries()->create([
            'event' => $this->event,
            'payload' => $this->payload,
            'status' => $status,
            'response_code' => $responseCode,
            'response_body' => substr($responseBody ?? '', 0, 1000),
            'latency_ms' => $latency,
        ]);

        if ($status !== 'delivered') {
            throw new \Exception('Webhook delivery failed');
        }
    }
}
