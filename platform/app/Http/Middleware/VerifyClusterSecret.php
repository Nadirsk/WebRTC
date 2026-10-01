<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Protects internal endpoints (allocator's project feed, orchestrator's webhook forwarder) the
 * same way the Node services protect theirs: a shared secret in the x-cluster-secret header.
 */
class VerifyClusterSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $given = (string) $request->header('x-cluster-secret', '');
        $expected = (string) config('services.cluster.secret');

        if ($expected === '' || ! hash_equals($expected, $given)) {
            abort(401, 'Missing or wrong cluster secret');
        }

        return $next($request);
    }
}
