# Phase 0 measurement report

Phase 0 has to prove that voice quality is good enough for the target market before building further. This file collects the numbers. Fill in the field sections after deploying a server ([DEPLOY_P0.md](DEPLOY_P0.md)).

## Exit criteria

| # | Criterion | Target | Status |
|---|---|---|---|
| 1 | End-to-end delay on 4G in the target market | < 300 ms | ⏳ needs field test |
| 2 | Audio understandable under packet loss | at 15–20% simulated loss | ⏳ needs field test (netem) |
| 3 | Join time | < 3 s | ⏳ needs field test (local: well under 1 s) |
| 4 | Listeners on one server without degradation | 200+ | ✅ locally (see below); repeat on the real server |

## Local results (development laptop, 2026-09-30)

Everything ran on one Windows laptop (4 cores): the media node with 2 workers plus headless Chrome hosting all clients. There is no real network in these numbers, so they show the software works and how cheap it is per listener, not what users will experience.

| Test | Result |
|---|---|
| Latency test, 15 beeps | 15/15 heard, median **84 ms**, range 74–84 ms, route UDP. This is encode + server + jitter buffer + decode with ~0 network delay: the floor any network delay adds to. |
| Load test, 1 speaker → 60 listeners, 35 s | 60/60 receiving, **0% loss**, jitter ~3 ms, busiest worker ~5% of one core |
| Load test, 1 speaker → 200 listeners, 45 s | 200/200 receiving, **0% loss**, jitter ~3 ms, busiest worker **~11% of one core**, node memory 62 MB |
| Room smoke test (two browsers) | 8/8 checks: join, receive audio, mute shows on the other side, go on stage, camera video received, leave |

Rough capacity signal: at ~11% of a core for 200 audio listeners, one core should forward audio to well over 1,000 listeners. Confirm this on the real server with listeners spread over several load machines.

## Field test plan

Run from real phones against the deployed server. For each row, run the latency test (30 beeps) and a 2-minute voice room call with someone on Wi-Fi.

| City | Network | Route (UDP/TCP/TURN) | RTT to server | Latency median | Latency p95 | Loss | Jitter | Call quality (1–5) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Karachi | Wi-Fi (fibre) | | | | | | | | |
| Karachi | Jazz 4G | | | | | | | | |
| Karachi | Zong 4G | | | | | | | | |
| Lahore | Telenor 4G | | | | | | | | |
| Lahore | Ufone 4G | | | | | | | | |
| Islamabad | Wi-Fi | | | | | | | | |
| Islamabad | Jazz 4G | | | | | | | | |
| Dubai | Wi-Fi | | | | | | | | |

Also test:

- [ ] **Force TURN relay** works on every network above (fallback for strict networks).
- [ ] Switching Wi-Fi → 4G in the middle of a call (today: ICE restart; note whether audio recovers and how fast).
- [ ] App in the background for 1 minute, then back (Android).
- [ ] Packet loss on a Linux test machine with `tc netem`: 5%, 10%, 20%, 30%. Note where speech stops being understandable.

## Server capacity on the real server

```bash
npm run loadtest -- --url https://<server> --listeners 200 --per-tab 50 --duration 120
```

| Listeners | Load machines | Receiving | Avg loss | Avg jitter | Busiest worker CPU | Server bandwidth out |
|---|---|---|---|---|---|---|
| 200 | | | | | | |
| 500 | | | | | | |
| 1000 | | | | | | |

## Conclusions

_To fill in after the field tests: are the targets met, and what changes before P1?_
