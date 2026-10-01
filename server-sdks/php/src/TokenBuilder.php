<?php

declare(strict_types=1);

namespace NadirNetwork\ServerSdk;

use InvalidArgumentException;

/**
 * Builds access tokens on your backend (PHP 7.4+, no extensions beyond the standard hash module).
 * Never ship the App Certificate to apps or browsers.
 *
 *   use NadirNetwork\ServerSdk\TokenBuilder;
 *
 *   $token = TokenBuilder::build(
 *       getenv('APP_ID'),
 *       getenv('APP_CERTIFICATE'),
 *       'room-1',          // channel
 *       'alice',           // uid
 *       TokenBuilder::ROLE_SPEAKER,
 *       3600               // lifetime in seconds, at most 86400
 *   );
 */
final class TokenBuilder
{
    public const ROLE_HOST = 'host';
    public const ROLE_SPEAKER = 'speaker';
    public const ROLE_AUDIENCE = 'audience';

    private const NAME = '/^[A-Za-z0-9_.-]{1,64}$/';

    public static function build(
        string $appId,
        string $appCertificate,
        string $channel,
        string $uid,
        string $role,
        int $expireSeconds = 3600
    ): string {
        if (!preg_match('/^[a-f0-9]{32}$/', $appId)) {
            throw new InvalidArgumentException('appId must be the 32-character App ID from the console');
        }
        if ($appCertificate === '') {
            throw new InvalidArgumentException('appCertificate is required');
        }
        if (!preg_match(self::NAME, $channel)) {
            throw new InvalidArgumentException('channel must be 1-64 characters: letters, digits, "_", "-" or "."');
        }
        if (!preg_match(self::NAME, $uid)) {
            throw new InvalidArgumentException('uid must be 1-64 characters: letters, digits, "_", "-" or "."');
        }
        if (!in_array($role, [self::ROLE_HOST, self::ROLE_SPEAKER, self::ROLE_AUDIENCE], true)) {
            throw new InvalidArgumentException('role must be host, speaker or audience');
        }
        if ($expireSeconds < 1 || $expireSeconds > 86400) {
            throw new InvalidArgumentException('expireSeconds must be between 1 and 86400');
        }

        $iat = time();
        $header = self::base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::base64url(json_encode([
            'v' => 1,
            'appId' => $appId,
            'channel' => $channel,
            'uid' => $uid,
            'role' => $role,
            'iat' => $iat,
            'exp' => $iat + $expireSeconds,
        ], JSON_UNESCAPED_SLASHES));
        $signature = self::base64url(hash_hmac('sha256', $header . '.' . $payload, $appCertificate, true));

        return $header . '.' . $payload . '.' . $signature;
    }

    private static function base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
