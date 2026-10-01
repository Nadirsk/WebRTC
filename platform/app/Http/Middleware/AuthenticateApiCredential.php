<?php

namespace App\Http\Middleware;

use App\Models\ApiCredential;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * REST API v1 authentication: `Authorization: Bearer <key>:<secret>`, from an organization's
 * API credentials (console > API keys). Attaches the organization to the request.
 */
class AuthenticateApiCredential
{
    public function handle(Request $request, Closure $next): Response
    {
        $header = (string) $request->header('Authorization', '');
        if (! str_starts_with($header, 'Bearer ') || ! str_contains($header, ':')) {
            abort(401, 'Missing API credentials. Send "Authorization: Bearer <key>:<secret>".');
        }

        [$key, $secret] = explode(':', substr($header, 7), 2);
        $credential = ApiCredential::where('key', $key)->first();

        if (! $credential || ! $credential->matchesSecret($secret)) {
            abort(401, 'Invalid API key or secret.');
        }

        if ($credential->organization->isSuspended()) {
            abort(403, 'This organization is suspended.');
        }

        $credential->forceFill(['last_used_at' => now()])->save();
        $request->attributes->set('organization', $credential->organization);
        $request->attributes->set('apiCredential', $credential);

        return $next($request);
    }
}
