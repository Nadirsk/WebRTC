/**
 * Every error the SDK throws is an RtcError with a stable `code` apps can switch on.
 *
 * Codes from the allocator: token_required, invalid_token, token_expired, wrong_app, wrong_channel,
 * wrong_uid, project_not_found, project_suspended, quota_exceeded, no_capacity, invalid_request.
 * Codes from the media node: banned, channel_full, speaker_limit, role_not_allowed, not_host,
 * not_publisher, node_draining, unsupported_protocol.
 * SDK codes: network, timeout, not_joined, invalid_state, no_edge_reachable.
 */
export class RtcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RtcError';
  }
}

/** Errors after which retrying the same request cannot succeed. */
const FATAL = new Set([
  'token_required',
  'invalid_token',
  'token_expired',
  'wrong_app',
  'wrong_channel',
  'wrong_uid',
  'project_not_found',
  'project_suspended',
  'banned',
  'role_not_allowed',
  'unsupported_protocol',
  'invalid_request',
  'invalid_ticket',
]);

export function isFatal(error: unknown): boolean {
  return error instanceof RtcError && FATAL.has(error.code);
}
