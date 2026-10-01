# Nadir Network Communication

Nadir Network Communication is a real-time voice and video platform (CPaaS) built on WebRTC, in the style of Agora and LiveKit: companies add our SDK to their apps, and calls run on our media servers.

**Status: Phase 1 built and tested locally** (many companies on one network, tokens, cascading, failover, SDK v1). Server deployment and field measurements are deliberately left for the end. See [docs/PLAN.md](docs/PLAN.md) for the phase plan and the Phase 1 report.

## What's here

| Folder | What it is |
|---|---|
| [protocol/](protocol/) | Messages between SDKs, the allocator and media nodes ([docs](docs/SIGNALING_PROTOCOL.md)) |
| [shared/](shared/) | Code shared by the services: tokens and edge tickets, JWT, HTTP helpers, logger |
| [allocator/](allocator/) | Public access point: checks token, project and quota, returns ranked media nodes and an edge ticket |
| [orchestrator/](orchestrator/) | Internal: node registry and heartbeats, room placement, failure detection, bans, metering |
| [media-node/](media-node/) | Edge media server: mediasoup SFU, signaling, host controls, cascading to other nodes |
| [sdk-core/](sdk-core/) | Client SDK logic shared by web and React Native (join, publish, reconnect, quality) |
| [sdk-web/](sdk-web/), [sdk-react-native/](sdk-react-native/) | The two client SDKs customers install |
| [server-sdks/](server-sdks/) | Token builders for customers' backends: Node, PHP, Python |
| [samples/](samples/) | Sample backend (token endpoint), web voice room, web video call, React Native voice room |
| [web-client/](web-client/) | Internal test pages: voice room, latency, load test, SDK harness |
| [website/](website/) | Public website (Next.js): products, network, pricing, docs, live demo |
| [config/projects.json](config/projects.json) | Customer projects until the developer console exists (Phase 2) |
| [tools/](tools/) | Local cluster runner, project tool, Phase 1 test suite, load and latency tools |
| [mobile-test/](mobile-test/) | Phase 0 Android test app (speaks protocol v1; superseded by samples/react-native-voice-room) |
| [deploy/](deploy/) | Ubuntu setup script, coturn, Caddy and systemd files (Phase 0, single node) |
| [docs/](docs/) | Plan, protocol, deployment, measurements |

## Run locally

Needs Node.js 22+, Google Chrome (for the tests), and PHP and Python only for the cross-language token test.

```bash
npm install
npm run build
npm run cluster          # orchestrator :4200, allocator :4100, media nodes :3001 :3002 :3003
```

Then open http://localhost:3001/room.html in two windows. The page uses the **Demo (testing mode)** project, so no token is needed. Try:

- Join as host in one window and speaker in another: the host can mute, move and remove.
- Kill the media node you are on (its PID is printed at start): the call moves to another node within about a second.
- `node tools/dev-cluster.mjs --capacity 2` makes rooms spill over to other nodes after two people, to see cascading.

Useful endpoints: `http://localhost:3001/api/stats` (a node's rooms, links, CPU), and on the orchestrator (header `x-cluster-secret: dev-cluster-secret-change-me`): `/internal/cluster`, `/internal/usage?appId=…`.

## Projects and tokens

```bash
node tools/project.mjs list
node tools/project.mjs create "Acme Chat"                 # token mode: prints App ID + certificate
node tools/project.mjs create "Sandbox" --testing         # testing mode: App ID only
node tools/project.mjs token <appId> <channel> <uid> speaker 3600
node tools/project.mjs suspend <appId>                    # takes effect within a second
node tools/project.mjs rotate <appId>                     # new primary certificate, old one stays valid
```

## Samples

```bash
node samples/build.mjs
npx tsx samples/token-server/server.ts    # http://localhost:5050 (uses the "Acme Chat (sample)" project)
```

## Tests

```bash
npm run test:p1            # the whole Phase 1 suite, each test on its own local cluster (~7 min)
npm run test:p1 -- --quick # without the 300-listener scale test
npm run test:unit          # token builders (Node, PHP, Python) against the verifier
```

| Test | What it proves |
|---|---|
| `tools/p1/tenancy.mjs` | Token rules, certificate rotation, suspended projects, quotas, forged tickets, role ceilings, 3 projects × 34 channels fully isolated |
| `tools/p1/moderation.mjs` | One room on three nodes: audio crosses nodes; mute, stage, remove with ban, second device, end of channel |
| `tools/p1/failover.mjs` | Kill a node mid-call: everyone back with audio in well under 3 s; planned drain; dead node's minutes closed |
| `tools/p1/session-life.mjs` | Token warning, renewal and expiry; participant-minutes and video minutes per project |
| `tools/p1/samples.mjs` | Real tokens from the sample backend; voice room and video call in two browsers |
| `tools/p1/cascade-scale.mjs` | 300 listeners in one room across 3 nodes, all receiving, capacity respected |
| `tools/p1/room-smoke.mjs` | The voice room test page |

`CHROME_PATH`, `PHP_PATH` and `PYTHON_PATH` override where the tests look for those programs.

## Website

```bash
npm run website:build && npx next start website --port 3100
```

- Brand, prices, regions and URLs live in [website/site.config.ts](website/site.config.ts). The brand is "Nadir Network Communication", named for the founder, Nadir Shaikh.
- The live demo uses the allocator at `NEXT_PUBLIC_ALLOCATOR_URL` (default `http://localhost:4100`) and the demo project.

## Configuration

Environment variables; see [.env.example](.env.example). For a cluster the important ones are `CLUSTER_SECRET` (required in production), `ORCHESTRATOR_URL`, `NODE_ID`, `PUBLIC_WS_URL`, `CLUSTER_WS_URL`, `NODE_MAX_PEERS`, `ANNOUNCED_ADDRESS` and `PIPE_ANNOUNCED_ADDRESS` (private IP for node-to-node media).
