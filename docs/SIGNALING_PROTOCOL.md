# Signaling protocol (v2)

How a client SDK reaches a media node and talks to it. The source of truth is [protocol/index.ts](../protocol/index.ts); this page explains the flow. The public version for customers is on the website at `/docs/signaling`.

v2 (Phase 1) replaces v1: the client first gets an **edge ticket** from the allocator, participants are identified by the customer's **uid**, and hosts can moderate. v1 clients are rejected with the code `unsupported_protocol`.

## Step 1: allocate (HTTPS)

```
POST <allocator>/v1/allocate
{ "appId": "…32 hex…", "channel": "room-1", "token": "<access token>", "exclude": [] }
```

| Field | Notes |
|---|---|
| `token` | Access token from the customer's backend ([tokens](#access-tokens)). Testing-mode projects send `uid` and `role` instead. |
| `exclude` | Node IDs the client just failed on (reconnect), so they are not offered again. |

Response:

```json
{
  "edges": [{ "nodeId": "local-1", "region": "local", "url": "ws://localhost:3001/ws" }],
  "ticket": "<edge ticket, valid 120 s>",
  "uid": "alice",
  "channel": "room-1",
  "maxRole": "speaker",
  "sessionExpiresAt": 1790003600
}
```

Up to three edges, best first: the node the room already uses (while it has space), then fallbacks. Errors: `{ "error": { "code", "message" } }` with HTTP 400 `invalid_request`, 401 `token_required` / `invalid_token` / `token_expired`, 403 `wrong_app` / `wrong_channel` / `wrong_uid` / `project_suspended` / `banned`, 404 `project_not_found`, 429 `quota_exceeded`, 503 `no_capacity`.

`POST /v1/renew` (same body plus `uid`) returns `{ ticket, sessionExpiresAt }` for a session that is already connected. `GET /v1/demo` returns the App ID of the public testing-mode project.

## Step 2: the media node (WebSocket)

- One WebSocket per client at `wss://<node>/ws`, JSON text frames. One connection is in one channel.
- The server pings every 10 s and drops a connection that misses a pong. The client sends `ping` every 3 s and treats two missed replies as a lost node.

| Frame | Direction | Shape |
|---|---|---|
| Request | client → server | `{ "id": 7, "method": "join", "data": { ... } }` |
| Response | server → client | `{ "id": 7, "ok": true, "data": { ... } }` or `{ "id": 7, "ok": false, "error": "…", "code": "speaker_limit" }` |
| Notification | server → client | `{ "notification": true, "method": "peerJoined", "data": { ... } }` |

Error messages are safe to show to users; `code` is stable for programs. Internal failures return code `internal` and are logged.

### Join flow

```
Client                                        Media node
  │ connect {protocolVersion: 2, ticket} ────────►  verify ticket, ban check, create/find room
  │ ◄─ {routerRtpCapabilities, uid, channel, nodeId, maxRole}
  │ device.load(routerRtpCapabilities)
  │ join {displayName, role, rtpCapabilities} ───►  role ≤ maxRole, speaker limit, session.start
  │ ◄─ {uid, peers[], producers[], iceServers[], sessionExpiresAt}   (others get peerJoined)
  │ createWebRtcTransport {direction:"recv"} ────►
  │ for each producer: consume → resumeConsumer
  │ (first DTLS) connectTransport ───────────────►
```

Publishing (host or speaker): `createWebRtcTransport {direction:"send"}`, then `produce`.

### Requests

| Method | Data | Returns | Notes |
|---|---|---|---|
| `connect` | `protocolVersion`, `ticket` | codecs, `uid`, `channel`, `nodeId`, `maxRole` | Must be first. Codes: `unsupported_protocol`, `invalid_ticket`, `ticket_expired`, `banned`, `channel_full`, `node_draining`. |
| `join` | `displayName`, `role`, `rtpCapabilities` | `uid`, `peers`, `producers`, `iceServers`, `sessionExpiresAt` | `role_not_allowed`, `speaker_limit`. |
| `createWebRtcTransport` | `direction` | transport parameters | Max 4 per peer. |
| `connectTransport` | `transportId`, `dtlsParameters` | – | |
| `restartIce` | `transportId` | `iceParameters` | After a transport goes `disconnected`/`failed`. |
| `produce` | `transportId`, `kind`, `rtpParameters`, `appData?` | `producerId` | Host/speaker only (`not_publisher`). Max 3 per peer. |
| `pauseProducer` / `resumeProducer` / `closeProducer` | `producerId` | – | Others are notified. |
| `consume` | `transportId`, `producerId` | consumer parameters | Starts paused. Works for tracks piped in from other nodes too. |
| `resumeConsumer` | `consumerId` | – | |
| `setRole` | `role` | `role` | Up to `maxRole`. Becoming `audience` closes the peer's producers. |
| `renewTicket` | `ticket` | `sessionExpiresAt` | Ticket from `/v1/renew`; same app, channel and uid (`wrong_session`). |
| `reportStats` | `rttMs`, `path`, `inKbps`, `outKbps`, `inLossPercent`, `outLossPercent`, `jitterMs` | – | At most every 2 s; stored for the call inspector. |
| `ping` | – | `t` | |
| `muteParticipant` | `uid`, `kind` | – | Host only (`not_host`). Server pauses the producer. |
| `setParticipantRole` | `uid`, `role` | – | Host only. Target's token must allow the role. |
| `removeParticipant` | `uid`, `banSeconds?` | – | Host only. Ban is kept cluster-wide by the orchestrator. |
| `endChannel` | – | – | Host only. Ends the channel on every node. |
| `leave` | – | – | |

Host commands work on participants connected to other nodes: the request travels over the cascade link and errors come back.

### Notifications

| Method | Data | When |
|---|---|---|
| `peerJoined` / `peerLeft` / `peerRoleChanged` | `uid`, `displayName`, `role` | People on any node of the channel |
| `newProducer` | `producerId`, `uid`, `kind`, `paused` | Someone started publishing: call `consume` |
| `producerPaused` / `producerResumed` / `producerClosed` | `producerId`, `uid` | |
| `consumerClosed` | `consumerId`, `producerId` | |
| `audioLevels` | `levels: [{uid, volume}]` | Every 500 ms while anyone speaks; dBov |
| `mutedByHost` | `kind`, `by` | A host muted you |
| `roleChangedByHost` | `role`, `by` | A host changed your role |
| `tokenWillExpire` | `expiresAt` | `TOKEN_WARNING_SECONDS` (30) before expiry |
| `removed` | `reason` (`kicked`, `channelEnded`, `tokenExpired`, `replaced`), `by?` | Session over; socket closes right after |
| `reconnectRequired` | `reason: "nodeDraining"` | Node is draining: allocate again (exclude this node) and move |

## Access tokens

HS256 JWT signed with the project's App Certificate (the certificate string is the HMAC key):

```json
{ "v": 1, "appId": "…", "channel": "room-1", "uid": "alice", "role": "speaker", "iat": 1790000000, "exp": 1790003600 }
```

Lifetime at most 24 h; 60 s clock skew allowed on `iat`. Only `alg: HS256` is accepted. Builders: [server-sdks/](../server-sdks/) (Node, PHP, Python).

## Edge tickets

HS256 JWT signed with `CLUSTER_SECRET`, made by the allocator after it checked the token, project, ban and quota:

```json
{ "typ": "edge", "appId": "…", "channel": "room-1", "uid": "alice", "role": "speaker", "sessionExp": 1790003600, "exp": <now + 120> }
```

Media nodes verify only tickets, so they never hold App Certificates or the project list. `sessionExp` is when the node ends the session unless a newer ticket arrives through `renewTicket`.
