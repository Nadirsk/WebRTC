# Nadir Network Communication — Architecture & Phase-wise Plan

> A commercial voice/video communication platform (CPaaS) in the style of Agora, LiveKit, and ZEGOCLOUD,
> built on WebRTC. Any company can sign up, get an App ID, and add real-time voice/video to its apps
> using our SDKs.
> Status: **P0 code done (field tests pending), P1 built and tested locally.** Server-level work
> (deployment, field measurements, Redis/infra, SDK publishing) is deliberately left for the end.
> Last updated: 2026-09-30

---

## Table of Contents

1. [Goal](#1-goal)
2. [Product offering: what a customer gets](#2-product-offering-what-a-customer-gets)
3. [How Agora SD-RTN works](#3-how-agora-sd-rtn-works)
4. [Mapping SD-RTN concepts to WebRTC](#4-mapping-sd-rtn-concepts-to-webrtc)
5. [Target architecture](#5-target-architecture)
6. [End-to-end call flow](#6-end-to-end-call-flow)
7. [Multi-tenancy and security](#7-multi-tenancy-and-security)
8. [Technology stack](#8-technology-stack)
9. [Assumptions and open decisions](#9-assumptions-and-open-decisions)
10. [Phase-wise plan](#10-phase-wise-plan)
11. [Quality targets (KPIs)](#11-quality-targets-kpis)
12. [Team](#12-team)
13. [Infrastructure, cost, and pricing basics](#13-infrastructure-cost-and-pricing-basics)
14. [Key risks](#14-key-risks)
15. [Sources](#15-sources)

---

## 1. Goal

Build our own real-time voice/video **network** and **developer platform**, similar in concept to Agora's
Software-Defined Real-Time Network (SD-RTN), using **WebRTC** as the media technology, and sell it as
a service to any company that needs in-app calling, voice rooms, or live streaming.

- **Customers:** app developers and businesses (social apps, voice-chat rooms, e-learning, telehealth,
  customer support, gaming, live commerce, etc.).
- **Business model:** usage-based pricing per participant-minute (audio / SD video / HD video), with a free tier.
- **Realistic first-year target:** an SD-RTN-style network in **3–5 regions**, strongest in our first
  target market (assumed: Pakistan, the Gulf, and South Asia). Agora's global network took ~10 years and
  hundreds of engineers; the core ideas are the same, but the scale is not.

---

## 2. Product offering: what a customer gets

| Item | Description |
|---|---|
| **Developer console** | Sign up, create projects, get **App ID + App Certificate**, see usage, billing, and call quality |
| **Client SDKs** | Web (JS/TS) and React Native first; then Flutter, Android (Kotlin), iOS (Swift) |
| **Server SDKs** | Token builders and REST clients for PHP, Node.js, Python (later Go, Java) |
| **Real-time voice & video** | 1-to-1 calls, group calls, voice rooms (host/speaker/audience), video (later phase) |
| **Interactive live streaming** | Hosts + large audiences in one channel (large-channel mode) |
| **REST API** | Manage channels and users: list, kick, mute, ban, end channel, start/stop recording |
| **Webhooks** | Channel created/destroyed, user joined/left, recording ready |
| **Cloud recording** | Recordings saved to our storage or the customer's S3 bucket |
| **Media gateways** | RTMP/HLS out (YouTube, CDN), RTMP/OBS in, SIP (later) |
| **Call quality analytics** | Per-call **Call Inspector**: RTT, loss, jitter, bitrate, reconnects per user |
| **Documentation & samples** | Quick-starts, API reference, sample apps for every SDK |
| **Pricing** | Free monthly minutes, then pay-as-you-go per 1,000 participant-minutes; enterprise plans with SLA |

---

## 3. How Agora SD-RTN works

The public internet is **best-effort**: ISPs route packets along the *cheapest* path (their own
network → free peers → paid transit), not the fastest. This causes packet loss, jitter, and delay
that hurt live calls. SD-RTN is a **software overlay network** of Agora's own data centres on top of
the internet, where Agora controls the routing.

| # | Concept | What it does | Agora's numbers |
|---|---|---|---|
| 1 | **Access points (not DNS)** | For every join request, the backend builds a custom list of the best entry servers for that client, based on live network conditions. DNS-based CDNs are slow to react to outages. | Connection in 1–2 s, first-time connection success |
| 2 | **Edge data centres** | Servers close to users keep the "last mile" short | 200+ data centres |
| 3 | **Private backbone overlay** | After the edge, media travels server-to-server on routes Agora chooses | Median global latency < 76 ms |
| 4 | **Smart routing + redundancy** | Paths are monitored continuously; by default data is sent over the **3 best paths** simultaneously | ≤ 0.5% packet loss per minute |
| 5 | **Large channel** | CDN-like tree for huge audiences: source → continental node → local data centre → audience, with shared paths | 1M+ audience in one channel |
| 6 | **Seamless failover** | If a server fails, everyone in the session is moved to another server with no noticeable interruption | 99.99% availability |
| 7 | **Full monitoring** | "Every user, every stream, every connection point" | Online/offline reports, real-time incident alerts |
| 8 | **Standard connection points** | Accepts and outputs WebRTC, RTP, RTMP, HLS, OBS | — |

**Conclusion:** SD-RTN is essentially **SFU media servers in many locations, linked into one network
(cascading), plus a smart dispatcher and router.** Every part of that can be built with WebRTC.

---

## 4. Mapping SD-RTN concepts to WebRTC

| SD-RTN component | Our WebRTC-based equivalent |
|---|---|
| Access point | **Allocator service**: an API returning a ranked list of edge nodes (GeoIP + node load + probe data). The SDK probes the top 2–3 and connects to the fastest. |
| Edge node | **SFU node** (mediasoup) with **TURN** (coturn) on the same host, including a TCP/TLS 443 fallback |
| Backbone | **SFU-to-SFU cascading** using mediasoup `PipeTransport` (RTP relay between servers) |
| Smart routing | **Probe mesh + route controller**: every node pings every other node (RTT/loss/jitter); the controller computes best and backup paths |
| Redundant paths | **Multipath relay**: primary and backup path; the receiving node de-duplicates by RTP sequence number |
| Packet-loss resilience | WebRTC tools: **Opus in-band FEC, RED (RFC 2198), NACK/RTX, DTX, jitter buffer**; video: **simulcast/SVC, TWCC/GCC bandwidth estimation, PLI/FIR** |
| Large channel | **Distribution tree**: publisher's edge → hub relay → many edges → subscribe-only audience |
| Failover | Node heartbeats + room registry in Redis; allocator reassigns; SDK auto-reconnects (ICE restart / rejoin) |
| Monitoring | SDK uploads `getStats()` data; nodes export metrics → ClickHouse + Grafana; per-call **Call Inspector** |
| RTMP / HLS / SIP | **Gateway nodes** (GStreamer/FFmpeg) and recording workers |

### Why mediasoup (instead of building on LiveKit)

- Cascading one room across servers and regions is the core of SD-RTN. **Open-source LiveKit does not
  do this** (a room lives on one node; cross-node/region mesh is a LiveKit Cloud feature).
- mediasoup has built-in **`PipeTransport`** for server-to-server relay, the main building block for cascading.
- The core is C++ (fast) and it is controlled from Node.js, so the routing, orchestration, and product
  logic are entirely ours. That matters when the network itself is the product we sell.
- `mediasoup-client` works in browsers and in React Native through `react-native-webrtc`.
- Alternative: **Pion (Go)**. It gives even more control, but we would write much more of the SFU ourselves.

---

## 5. Target architecture

```
                         ┌───────────────────────────────────────┐
                         │   CUSTOMER APPS (any company)          │
                         │   Our SDK: Web │ React Native │ later: │
                         │   Flutter, Android, iOS                │
                         │   (WebRTC + auto-reconnect + probing + │
                         │    stats upload + simple join() API)   │
                         └──────┬───────────────────┬─────────────┘
              ① join request    │                   │ ③ WebRTC media (UDP; TCP/TLS 443 fallback)
              (token, channel)  ▼                   ▼
┌──────────────────────────────────┐   ┌──────────────── EDGE LAYER (per region) ─────────────────┐
│ ACCESS / ALLOCATOR SERVICE       │   │  Region: Dubai        Region: Mumbai     Region: Frankfurt│
│ • validates token + project      │②  │  ┌───────────────┐   ┌──────────────┐   ┌──────────────┐ │
│ • GeoIP + node load + probe data │──►│  │Edge node      │   │Edge node     │   │Edge node     │ │
│ • returns ranked edge list       │   │  │ signaling(WS) │   │              │   │              │ │
│ • room placement, quota checks   │   │  │ mediasoup SFU │   │  ...         │   │  ...         │ │
└──────────────┬───────────────────┘   │  │ coturn TURN   │   │              │   │              │ │
               │                       │  └──────┬────────┘   └──────┬───────┘   └──────┬───────┘ │
               ▼                       └─────────┼───────────────────┼──────────────────┼─────────┘
┌──────────────────────────────────┐             │ ④ cascading (PipeTransport RTP relay)│
│ ORCHESTRATION                     │            ▼                   ▼                  ▼
│ • Room registry (Redis):          │   ┌──────────────── BACKBONE LAYER ─────────────────────────┐
│   which room lives on which nodes │   │  Hub relay nodes (e.g. Dubai hub, Singapore hub, EU hub)│
│ • Node manager: register,         │◄──│  • Probe mesh: every node pings every node (RTT/loss)   │
│   heartbeat, drain, failover      │   │  • Route controller: best path + backup path            │
│ • Route controller                │   │  • Large channel: publisher→hub→edges→audience tree     │
└──────────────┬───────────────────┘   └─────────────────────────────────────────────────────────┘
               │ events (join / leave / minutes / quality)
               ▼
┌──────────────────────────── PLATFORM / BUSINESS LAYER ──────────────────────────────┐
│ Accounts, orgs, teams │ Projects (App ID + App Certificate) │ Token service │       │
│ REST API │ Webhooks │ Usage metering │ Billing & plans │ Quotas / rate limits │     │
│ Developer console │ Docs portal │ Admin panel (our internal ops)                     │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌── GATEWAYS ────────────────────┐ ┌── DATA & OBSERVABILITY ────────────────────────────┐
│ Recording → S3/MinIO or        │ │ NATS/Kafka → ClickHouse (stats, usage)             │
│   customer's own bucket        │ │ Prometheus + Grafana + Loki │ Call Inspector      │
│ RTMP/HLS out (YouTube, CDN)    │ │ Alerts (node down, loss spike, region degraded)    │
│ RTMP/OBS in │ SIP (later)      │ │ Public status page                                 │
└────────────────────────────────┘ └────────────────────────────────────────────────────┘
```

### Layers

| Layer | Responsibility |
|---|---|
| **Client SDK** | WebRTC capture/playback, join/leave, roles (host/audience), mute, active-speaker and network-quality callbacks, edge probing, auto-reconnect, stats upload |
| **Access / Allocator** | Token and project validation, quota checks, choosing edge nodes per client, room placement |
| **Edge layer** | Signaling (WebSocket), SFU (mediasoup workers), TURN; terminates client WebRTC connections |
| **Backbone layer** | Relaying streams between edges and hubs, probe mesh, best-path and backup-path routing, broadcast trees |
| **Orchestration** | Room registry, node lifecycle (register, heartbeat, drain, failover), route computation |
| **Platform / Business** | Accounts, projects, keys, tokens, REST API, webhooks, metering, billing, quotas, console, docs, internal admin |
| **Gateways** | Recording, RTMP/HLS out, RTMP/OBS in, SIP (later) |
| **Data & Observability** | Metrics, logs, call-quality analytics, alerting, public status page |

---

## 6. End-to-end call flow

Example: a customer's app ("Acme Chat") lets a user join voice room `room_123`.

1. **Token:** Acme's backend signs a short-lived token with its App Certificate using our server SDK.
2. **Join:** Acme's app calls `sdk.join(appId, "room_123", token, uid, role)`; the SDK calls the **Allocator**.
3. **Allocation:** the allocator validates the token, checks that Acme's project is active and within its
   quota, and looks up where `room_123` (scoped to Acme's App ID) already lives in the **Room Registry**.
   It returns the 2–3 best edge nodes for this client (e.g. `dubai-edge-2`).
4. **Connect:** the SDK probes the candidates, opens a WebSocket to the best one, and negotiates WebRTC.
   Target: **< 2 s** join time.
5. **Media:** a speaker publishes audio **once**. Listeners on the same node receive it directly. If
   listeners are on other nodes or regions, the stream is **piped** across the backbone (optionally over
   a backup path as well).
6. **Telemetry:** the SDK uploads quality stats every few seconds. The edge emits join/leave events, which
   the platform turns into **minutes → metering → Acme's bill → webhook to Acme's backend**.
7. **Failure:** if a node dies, heartbeats stop, the orchestrator re-places the room, and the SDK
   reconnects to the next node in its list.

---

## 7. Multi-tenancy and security

Because many customers share one network, isolation and security are core requirements, not add-ons.

| Area | Approach |
|---|---|
| **Tenant isolation** | Every room, user, event, and metric is keyed by **App ID**. A channel name `room_123` in project A never collides with `room_123` in project B. |
| **Authentication** | Clients never see the App Certificate. Customer backends sign short-lived JWT tokens (HS256) with claims `appId`, `channel`, `uid`, `role`, `privileges`, `exp`. |
| **Key management** | App Certificates can be rotated (primary + secondary for zero-downtime rotation) and disabled. REST API uses separate API key/secret pairs. |
| **Encryption** | WebRTC DTLS-SRTP in transit (mandatory); optional **end-to-end encryption** (Insertable Streams / SFrame) in a later phase. |
| **Quotas & rate limits** | Per project: max concurrent users, max channels, REST rate limits, spending limits. Protects the network from one customer overloading it. |
| **Abuse protection** | Token replay limits, join-rate limits per IP, ability to suspend a project instantly. |
| **Webhook security** | Signed payloads (HMAC), retries with backoff, delivery logs visible in the console. |
| **Data & privacy** | Recordings stored per project (or in the customer's own bucket); configurable retention; data-residency region option (later). |
| **Internal admin** | Our ops panel to view customers, usage, suspend projects, issue credits, and inspect calls. |

---

## 8. Technology stack

| Area | Choice |
|---|---|
| Media engine (SFU) | **mediasoup** (C++ core, Node.js control) |
| Signaling / Allocator / Orchestrator | Node.js + TypeScript (Go possible later for the allocator) |
| TURN | coturn |
| Room registry / state | Redis (clustered) |
| Event bus | NATS (or Kafka) |
| Stats / usage store | ClickHouse |
| Platform DB | PostgreSQL |
| Platform backend | Laravel or Node.js (see decision D6) — it carries no media, so either works |
| Developer console, docs portal | Next.js |
| Payments | Stripe and/or a local payment gateway (see decision D7) |
| Client SDK | TypeScript core; `mediasoup-client` (web); `react-native-webrtc` (React Native) |
| SDK distribution | npm (web, React Native), later pub.dev (Flutter), Maven Central (Android), CocoaPods/SPM (iOS) |
| Gateways | GStreamer / FFmpeg |
| Infrastructure | High-bandwidth bare metal / VMs for media nodes (e.g. Hetzner, OVH, regional data centres); Docker; Terraform + Ansible |
| Monitoring | Prometheus, Grafana, Loki, public status page |
| Weak-network testing | Linux `tc netem` (simulated loss / jitter / delay) |

### Proposed repository layout (monorepo)

```
rtc-platform/
├── media-node/        # mediasoup SFU + signaling (WebSocket) + pipe/cascade logic
├── allocator/         # access-point service: token check, quotas, edge selection, room placement
├── orchestrator/      # room registry, node manager, probe collector, route controller
├── sdk-core/          # shared TypeScript SDK logic (signaling protocol, reconnect, stats)
├── sdk-web/           # browser SDK (mediasoup-client)
├── sdk-react-native/  # React Native SDK (react-native-webrtc)
├── server-sdks/       # token builders + REST clients: PHP, Node, Python
├── platform/          # accounts, projects, keys, REST API, webhooks, metering, billing, admin
├── console/           # Next.js developer console + docs portal
├── gateways/          # recording, RTMP/HLS egress, RTMP ingress
├── samples/           # sample apps for each SDK (voice room, 1-to-1 call, live stream)
├── infra/             # Terraform, Ansible, Docker, Grafana dashboards
└── tools/             # load tester, netem profiles, probe tools
```

---

## 9. Assumptions and open decisions

| # | Decision | Assumed in this plan | Alternatives |
|---|---|---|---|
| D1 | Scope | ✅ **Confirmed:** a general commercial platform for any customer (like Agora / LiveKit) | — |
| D2 | Media engine | mediasoup | Pion (Go), LiveKit (no OSS cascading) |
| D3 | v1 features | Voice: 1-to-1 calls + voice rooms (host/speaker/audience); video in a later phase | Include video in v1 |
| D4 | First target market / regions | Pakistan, the Gulf, South Asia → Dubai/Bahrain + a Pakistan data centre, then Mumbai, Frankfurt, Singapore | Different market first |
| D5 | Hosting provider | To be decided | Hetzner / OVH / regional DCs / AWS (expensive egress) |
| D6 | Platform backend stack | To be decided: Laravel (team familiarity) or Node.js (same language as media services) | Go |
| D7 | Payments | To be decided: Stripe (international) + local gateway for the first market | Invoice-only for enterprise |
| D8 | Self-hosted edition | Cloud-only at first | Also sell an on-premise edition later (like LiveKit's open-source + cloud model) |
| D9 | Product name / brand | ✅ **Confirmed: Nadir Network Communication** (named for the founder, Nadir Shaikh). Domain and trademark still to be checked | — |

---

## 10. Phase-wise plan

Overview (durations are rough estimates for the team in section 12):

| Phase | Name | Goal | Duration |
|---|---|---|---|
| **P0** | Proof of Concept | Prove WebRTC voice quality in the target market on our own server | 2–3 weeks |
| **P1** | Core Network: Single Region | Production-grade network in one region + SDK v1 | 6–8 weeks |
| **P2** | Developer Platform MVP | Console, projects, keys, tokens, REST, webhooks, metering; ready for beta customers | 6–8 weeks (parallel with P1) |
| **—** | 🚀 **Public beta** | First external customers onboard (free tier / beta pricing) | ~Month 4 |
| **P3** | Multi-Region SD-RTN | Our own backbone across 3 regions with smart routing and failover | 8–12 weeks |
| **P4** | Quality Engineering | Good calls on weak/mobile networks (runs alongside P1 onward) | Ongoing |
| **P5** | Billing, Gateways + Large Channel | Paid plans, recording, RTMP/HLS, OBS input, 10k+ audience | 6–8 weeks |
| **—** | 🚀 **General availability (GA)** | Paid plans live, SLA published | ~Month 8–9 |
| **P6** | Advanced | Video product, more SDKs, AI features, SIP, more regions | Later |

```
Month:        1     2     3     4     5     6     7     8     9
P0 PoC       ███
P1 Network        ██████████
P2 Platform         ██████████
                              ▲ Public beta
P3 Multi-reg                ██████████████
P4 Quality        ═══════════════════════════════════════════ (ongoing)
P5 Billing/GW                             ██████████
                                                    ▲ GA
P6 Advanced                                         ████ →
```

---

### P0 — Proof of Concept (2–3 weeks)

**Goal:** confirm that self-hosted WebRTC gives good voice quality in our target market before investing further.

**Scope**
- One media server in the nearest region (Dubai, or a Pakistan DC).
- Minimal signaling and one voice room, with no production concerns yet.

**Tasks**
- [ ] Provision one server (public IP, UDP port range open, TLS certificate)
- [ ] Install and configure mediasoup (one worker per CPU core)
- [ ] Minimal WebSocket signaling: join room, create transports, produce/consume audio
- [ ] Install coturn (UDP 3478 + TLS 443)
- [ ] Web test page (browser) for a voice room
- [ ] React Native test app (Expo dev build + `react-native-webrtc` + `mediasoup-client`)
- [ ] Basic load test: 1 speaker → 50 / 100 / 200 listeners on one server
- [ ] Measure latency, packet loss, jitter, CPU, and bandwidth from real devices in several cities
      and on major mobile operators, on Wi-Fi and 4G

**Deliverables**
- Working PoC voice room (web + React Native)
- Measurement report: latency, loss, CPU per listener, bandwidth per listener (this becomes the basis for server sizing and pricing)

**Exit criteria**
- Mouth-to-ear latency **< 300 ms** in the target market on 4G
- Audio remains understandable at **15–20% simulated packet loss**
- Join time **< 3 s**
- **200+ listeners** on a single server without audio degradation

**Risks:** some mobile networks may block or throttle UDP (mitigation: TURN over TLS 443). Expo dev build setup effort.

---

### P1 — Core Network: Single Region (6–8 weeks)

**Goal:** a production-grade, multi-tenant network in one region, with SDK v1.

**Scope**

1. **Media node** (`media-node/`)
   - [ ] Production signaling protocol (WebSocket, JSON messages, versioned for SDK compatibility)
   - [ ] All rooms scoped by App ID (tenant isolation)
   - [ ] Roles: host / speaker / audience (audience subscribe-only)
   - [ ] Server-side mute, kick, and max-speaker limits
   - [ ] Active-speaker detection (audio level observer) → events to clients
   - [ ] **Intra-region cascading:** a room spans multiple nodes via `PipeTransport` when one node is full
   - [ ] Emit usage events (join/leave with timestamps, media type) for metering
   - [ ] Node metrics export (CPU, bandwidth, rooms, participants)
2. **Allocator** (`allocator/`)
   - [ ] `POST /v1/allocate` → validates token + project status + quotas, returns ranked edge list + edge session ticket
   - [ ] Room placement: new room → least-loaded node; existing room → same node or cascade to a new node
3. **Orchestrator** (`orchestrator/`)
   - [ ] Node registration and heartbeat (every 2–5 s)
   - [ ] Room registry in Redis (`appId:room → nodes`, `node → load`)
   - [ ] Node drain (for deploys) and failure detection → re-placement
4. **Tokens** (`server-sdks/`)
   - [ ] Token spec (JWT HS256 signed with the App Certificate; claims: `appId`, `channel`, `uid`, `role`, `privileges`, `exp`)
   - [ ] Token builders: PHP, Node, Python
5. **SDK v1** (`sdk-core/`, `sdk-web/`, `sdk-react-native/`)
   - [ ] API: `init(appId)`, `join(channel, token, uid, role)`, `leave()`, `muteLocalAudio()`, `setRole()`, `renewToken()`
   - [ ] Events: `userJoined`, `userLeft`, `activeSpeaker`, `networkQuality`, `connectionStateChanged`, `tokenWillExpire`
   - [ ] Edge probing (pick the fastest of the allocator's candidates)
   - [ ] **Auto-reconnect** (ICE restart, then full rejoin on another node)
   - [ ] Stats upload every 5–10 s (RTT, loss, jitter, bitrate)
   - [ ] Semantic versioning + published to npm (private registry during beta)
6. **Sample apps** (`samples/`)
   - [ ] Voice room sample (web + React Native)
   - [ ] 1-to-1 voice call sample
7. **Ops**
   - [ ] Docker images, Ansible provisioning, Grafana dashboards, alerts (node down, high loss)

**Deliverables:** one production region; SDK v1 (web + React Native); server token builders; sample apps.

**Exit criteria**
- **1,000 concurrent listeners** in one room spread across **3+ nodes** in one region
- **100+ concurrent rooms** from **multiple test projects** with no cross-tenant leakage
- Node killed during a call → users reconnected in **< 3 s**
- Join success rate **≥ 99.5%**, median join time **< 2 s**
- Zero-downtime deploy using node drain

**Risks:** cascading bugs (state sync between nodes); reconnect edge cases on mobile (app backgrounding, network switching between Wi-Fi and 4G).

#### P1 status (2026-09-30): built and tested on a local 3-node cluster

Everything that does not need real servers is done. Run it with `npm run cluster`; test it with `npm run test:p1`.

| Scope item | Where | Status |
|---|---|---|
| Protocol v2, App ID scoping, roles, server-side mute/role/kick/ban, end channel | `protocol/`, `media-node/` | ✅ |
| Active speaker events, max-speaker limit | `media-node/src/Room.ts` | ✅ |
| Intra-region cascading (PipeTransport full mesh, remote peers and tracks, host commands across nodes) | `media-node/src/cluster.ts` | ✅ |
| Usage events (join/leave, video time), quality reports | `media-node/src/orchestrator.ts` → `data/*.jsonl` | ✅ |
| Node metrics (`/api/stats`, heartbeat load) | `media-node/src/index.ts` | ✅ |
| Allocator: token + project + quota + ban checks, ranked edges, edge ticket, `/v1/renew` | `allocator/` | ✅ |
| Orchestrator: registry, heartbeats, placement (fill then spill), failure detection, drain, metering | `orchestrator/` | ✅ (in-memory; Redis at the server stage) |
| Token spec + builders (Node, PHP, Python), certificate rotation | `shared/auth.ts`, `server-sdks/` | ✅ |
| SDK v1: API, events, edge fallback, auto-reconnect, token renewal, network quality, stats upload | `sdk-core/`, `sdk-web/`, `sdk-react-native/` | ✅ (npm publishing at the end) |
| Samples: voice room + 1-to-1 video call (web), React Native voice room (code), sample token backend | `samples/` | ✅ (RN sample not built into an APK) |
| Ops: Docker, Ansible, Grafana, alerts | – | ⏳ server stage |

Exit criteria on the local cluster:

| Criterion | Result |
|---|---|
| Many listeners in one room across 3+ nodes | ✅ 300 listeners over 3 nodes (capacity 110 each): 300/300 receiving, 0.0% loss. 1,000 needs several load machines (one browser profile caps at ~255 WebSockets) → server stage |
| 100+ concurrent rooms from multiple projects, no leakage | ✅ 102 rooms, 3 projects with identical channel names and uids, 0 leaks |
| Node killed during a call → reconnected < 3 s | ✅ about 0.2 s for every listener, audio flowing again |
| Zero-downtime deploy via drain | ✅ drain moves everyone in about 0.2 s; drained node gets no new placements |
| Join success ≥ 99.5%, median join < 2 s | ✅ locally (all test joins succeed, well under 1 s); to be measured on real networks |

Also verified: token expiry warning, renewal and expiry; bans survive the room closing; a second device replaces the first session; participant-minutes within 5% of actual time, video minutes separate; projects billed separately; the dead node's sessions closed for billing.

Known limits and deliberate stand-ins until the server stage: projects in `config/projects.json` (the console replaces it in P2); registry in orchestrator memory (Redis for more than one orchestrator); metering in JSON-lines files (ClickHouse later); one room uses one worker per node (a room grows by spilling to other nodes, not other workers); edge choice is "first reachable in order" (latency probing matters from P3, multi-region).

---

### P2 — Developer Platform MVP (6–8 weeks, parallel with P1)

**Goal:** everything an outside developer needs to sign up and integrate without talking to us. Required before public beta.

**Scope**
- [ ] Accounts, organisations, team members (roles: owner / admin / developer / billing)
- [ ] Projects → **App ID + App Certificate** (primary/secondary, rotate, disable)
- [ ] REST API credentials (key/secret) per organisation
- [ ] **REST API v1:** list channels, list users in a channel, kick user, ban, mute, end channel
- [ ] **Webhooks:** channel created/destroyed, user joined/left (HMAC-signed, retries, delivery logs)
- [ ] **Usage metering:** participant-minutes per project, split by type (audio / SD / HD video) from node events → ClickHouse
- [ ] Quotas and rate limits per project (concurrent users, channels, REST calls)
- [ ] **Developer console (Next.js):** sign-up, projects, keys, usage graphs, webhook settings, basic call list
- [ ] **Docs portal:** quick-starts (web, React Native), token guide, REST reference, webhook reference
- [ ] **Internal admin panel:** customers, projects, usage, suspend/unsuspend, notes
- [ ] Beta access flow (invite codes or approval)

**Deliverables:** console, docs, REST API, webhooks, metering, admin panel.

**Exit criteria**
- A new developer can sign up, create a project, get keys, and run a sample voice room in **< 15 minutes** using only the docs
- Metered minutes match raw node events within **±1%**
- Suspending a project blocks new joins within **10 s**

**Milestone after P1 + P2:** 🚀 **Public beta**: onboard the first external customers on the free tier or beta pricing.

---

### P3 — Multi-Region SD-RTN (8–12 weeks)

**Goal:** our own backbone. Users connect to their nearest region, and rooms span regions transparently.

**Scope**
- [ ] Add 2 more regions (chosen from beta customers' user distribution)
- [ ] **Hub relay nodes** per region for inter-region traffic
- [ ] **Inter-region cascading:** streams piped edge → hub → hub → edge
- [ ] **Probe mesh:** every node measures RTT / loss / jitter to all hubs and peers every few seconds; results go to the orchestrator
- [ ] **Route controller:** builds a network cost graph and computes the best path + backup path (shortest path on measured cost)
- [ ] **Multipath redundancy** (configurable per project/plan): send over primary + backup path; de-duplicate at the receiving node
- [ ] **Allocator v2:** GeoIP + live node load + probe data + client-side probe results
- [ ] **Regional failover:** if a region degrades or fails, rooms and users move to the next-best region
- [ ] Global room registry (Redis cluster, or a replicated store across regions)
- [ ] Public status page per region

**Deliverables:** 3-region network with smart routing, redundancy, and failover.

**Exit criteria**
- Cross-region room end-to-end latency **< 250 ms** median
- Backbone packet loss **≤ 0.5% per minute** with multipath enabled
- Whole-region outage (simulated) → users recovered in **< 5 s**
- Route controller reroutes around a degraded link **within 10 s**

**Risks:** inter-region bandwidth costs; state consistency across regions; complexity of route computation.

---

### P4 — Quality Engineering (ongoing, from P1 onward)

**Goal:** calls sound good on weak and mobile networks. This is what customers compare between providers.

**Scope**
- [ ] **Audio:** tune Opus (bitrate, in-band FEC, DTX), enable **RED** redundant audio, tune NACK/RTX and the jitter buffer
- [ ] **Video (when enabled):** simulcast / SVC, TWCC bandwidth estimation, keyframe request handling
- [ ] **Network test lab:** `tc netem` profiles (2G/3G/4G, 10/20/40% loss, 100–500 ms jitter, bursts)
- [ ] Automated quality regression tests on each release (MOS-style scoring)
- [ ] **Call Inspector in the console:** customers see a per-call timeline of each user's RTT, loss, jitter, bitrate, and reconnects
- [ ] Quality alerts per region and ISP
- [ ] Published benchmark comparisons (useful for sales)

**Exit criteria**
- Audio understandable at **30% random packet loss**
- Call Inspector available to customers for every call
- Automated weak-network test suite in CI

---

### P5 — Billing, Gateways + Large Channel (6–8 weeks)

**Goal:** turn the beta into a paid product, and add broadcasting features.

**Scope**
- **Billing**
  - [ ] Pricing plans: free tier (e.g. 10k minutes/month), pay-as-you-go, enterprise
  - [ ] Payment integration (card payments + local gateway), prepaid wallet and/or monthly invoices
  - [ ] Spending limits, low-balance alerts, invoices and receipts in the console
- **Gateways**
  - [ ] **Cloud recording:** mixed audio (video later) → our storage or the customer's S3 bucket; REST start/stop; webhook when ready
  - [ ] **RTMP/HLS out:** push a room to YouTube, Facebook, or a CDN
  - [ ] **RTMP/OBS in:** bring an external stream into a room
- **Large channel**
  - [ ] Broadcast tree (publisher edge → hubs → many edges → audience) for 10k+ listeners in one room
  - [ ] Audience-only fast join path (no publish transport → lighter and faster)
- **Commercial readiness**
  - [ ] Published SLA, terms of service, privacy policy, support channels

**Exit criteria**
- Customers can self-serve from free tier to paid plan
- **10,000 concurrent listeners** in one room, latency < 400 ms
- Recording available within 60 s of room end

**Milestone after P5:** 🚀 **General availability (GA)**.

---

### P6 — Advanced (later)

- Full video product (1-to-1 video, group video, video live streaming)
- Native Android/iOS and Flutter SDKs
- Real-time messaging / signaling SDK (like Agora RTM) for in-app events
- End-to-end encryption (SFrame)
- AI/ML-assisted routing (predicting link quality from history)
- AI noise suppression, echo improvements
- Real-time transcription / translation
- Real-time audio content moderation
- SIP / PSTN gateway (phone dial-in)
- Self-hosted / on-premise edition (if decision D8 = yes)
- More regions (Singapore, US, Africa, etc.) and data-residency options

---

## 11. Quality targets (KPIs)

| Metric | Beta target | GA+ target | Agora reference |
|---|---|---|---|
| Join time (median) | < 2 s | < 1.5 s | 1–2 s |
| Join success rate | ≥ 99.5% | ≥ 99.9% | "guaranteed first-time" |
| In-region latency (median) | < 150 ms | < 100 ms | < 76 ms global median |
| Cross-region latency (median) | — | < 250 ms | < 400 ms guaranteed |
| Backbone packet loss | — | ≤ 0.5% / min | ≤ 0.5% / min |
| Audio usable at packet loss | 20% | 30% | — |
| Recovery after node failure | < 3 s | < 2 s | "no perceptible interruption" |
| Availability | 99.5% | 99.9% (SLA) | 99.99% |
| Time to first call for a new developer | < 15 min | < 10 min | — |

---

## 12. Team

| Role | Count | Focus |
|---|---|---|
| WebRTC / media engineer | 1–2 | mediasoup, cascading, routing, quality tuning |
| Backend engineer | 1–2 | Allocator, orchestrator, platform layer, metering, billing |
| SDK engineer | 1 | Web + React Native SDKs, reconnect logic, sample apps |
| Frontend engineer | 1 | Developer console, docs portal, admin panel |
| DevOps / SRE | 1 | Servers, regions, deploys, monitoring, load testing, status page |
| Developer relations / docs (from beta) | 0.5–1 | Documentation, samples, customer onboarding |

---

## 13. Infrastructure, cost, and pricing basics

- **Bandwidth is the main cost.** Media servers send far more data than they receive.
  - One Opus audio stream ≈ 40 kbps → 1,000 listener-minutes ≈ **0.3 GB**.
  - Example voice room: 8 speakers × 500 listeners → each listener receives ~320 kbps → **~160 Mbps** egress for the room.
  - 720p video ≈ 1.5 Mbps per stream → 1,000 minutes ≈ **11 GB**.
- **Hosting:** AWS/GCP egress is ~$0.09/GB. High-bandwidth bare metal (Hetzner, OVH, regional data centres)
  is typically 5–10× cheaper for media nodes. The control plane can run anywhere.
- **Market pricing (competitors):** Agora ~$0.99 / 1,000 audio minutes, $3.99 / 1,000 SD video minutes,
  $8.99 / 1,000 HD video minutes, 10k free minutes/month; ZEGOCLOUD ~$0.99 audio and $3.99 video per 1,000 minutes.
- **Our pricing:** set after P0 measurements (real cost per 1,000 minutes), aiming to be competitive with
  Agora/ZEGOCLOUD in our target market.
- **Media node requirements:** public IP, open UDP port range (e.g. 40000–49999), TCP/TLS 443 for TURN
  fallback, host networking (no double NAT), good CPU (one mediasoup worker per core).

---

## 14. Key risks

| Risk | Impact | Mitigation |
|---|---|---|
| UDP blocked or throttled on some mobile networks | Calls fail or sound bad | TURN over TLS 443; measure per ISP in P0 |
| Cascading complexity | Bugs, audio loss between nodes | Intra-region cascading first (P1) before cross-region (P3); strong integration tests |
| Mobile reconnect edge cases | Dropped calls on network switch / backgrounding | Dedicated reconnect state machine in SDK; device test matrix |
| One customer overloading shared infrastructure | Poor quality for all customers | Quotas, rate limits, capacity headroom, per-project isolation |
| Bandwidth cost growth | Margins shrink | Bandwidth-friendly providers; audience-only optimisations; DTX (silence = no data) |
| Competing with established providers | Hard to win customers | Focus on the target market (latency, local payments, pricing, support); excellent docs and fast onboarding |
| SDK backward compatibility | Breaking customers' apps | Versioned signaling protocol; semantic versioning; deprecation policy |
| Small team vs a huge scope | Slow delivery | Strict phase gates; voice-only until GA; video later |
| Control plane as a single point of failure | Nobody can join | Allocator/orchestrator run as 2+ instances; Redis cluster; running calls continue if the control plane is briefly down |

---

## 15. Sources

- [Agora — Software-Defined Real-Time Network](https://www.agora.io/en/software-defined-real-time-network/)
- [Agora white paper — SD-RTN delivers Real-Time Internet advantages over CDN](https://hello.agora.io/rs/096-LBH-766/images/Agora_WP_SD-RTN-Delivers-RealTime-Internet-Advantages.pdf)
- [Agora — Network white paper page](https://www.agora.io/en/network-white-paper)
- [Agora SDK 2026 pricing (Forasoft)](https://www.forasoft.com/blog/article/video-call-app-agora-sdk-2026)
- [ZEGOCLOUD pricing (Capterra)](https://www.capterra.com/p/265363/ZEGOCLOUD/)
- [SFU comparison: mediasoup / Janus / LiveKit / Jitsi / Pion (Forasoft)](https://www.forasoft.com/learn/video-streaming/articles-streaming/sfu-comparison-mediasoup-janus-livekit-jitsi-pion)
- [LiveKit — Intro docs](https://docs.livekit.io/home/get-started/intro-to-livekit/)
