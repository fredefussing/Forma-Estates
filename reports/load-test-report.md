# Chain launch capacity report

Generated: 2026-08-19T09:38:45.309Z
Target: `http://127.0.0.1:5001` (test-only server mode; no paid AI provider calls)
Fixture: `public/favicon-512.png`

## Coverage

- Firebase-authenticated session verification (`/api/auth/verify`)
- Bolig case creation and case-image persistence
- Multipart source-image upload combined with AI-image submission (`/api/bolig/generate`)
- Multipart 3D-floorplan submission (`/api/bolig/floorplan-3d`)
- Multipart showcase-video submission (`/api/bolig/showcase-video`)

## 12-store simultaneous launch

Requests measured: **72**

| Operation | Requests | p50 | p95 | p99 | Unexpected errors | Expected 429s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| login / auth verify | 12 | 480 ms | 501 ms | 501 ms | 0 | 0 |
| case create | 12 | 33 ms | 42 ms | 42 ms | 0 | 0 |
| case image save | 12 | 52 ms | 67 ms | 67 ms | 0 | 0 |
| image upload + AI submit | 12 | 249 ms | 284 ms | 284 ms | 0 | 0 |
| 3D floorplan submit | 12 | 20 ms | 31 ms | 31 ms | 0 | 0 |
| showcase video submit | 12 | 22 ms | 40 ms | 40 ms | 0 | 0 |

- Queue: peak **1 active**, **11 waiting**; **12** completed, **0** failed, and **0** rejected at the configured backlog cap.
- Database pool: peak **10 connections**, **2 waiting**.
- Memory: Node peak RSS **332.0 MB**; V8 heap used **85.7 MB**; synthetic FFmpeg child peak RSS **442.1 MB**.
- Unexpected HTTP/network errors: **0**.

## 100-request mixed burst

Requests measured: **100**

| Operation | Requests | p50 | p95 | p99 | Unexpected errors | Expected 429s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| login / auth verify | 20 | 93 ms | 94 ms | 95 ms | 0 | 0 |
| case create | 16 | 97 ms | 119 ms | 119 ms | 0 | 0 |
| case image save | 16 | 147 ms | 167 ms | 167 ms | 0 | 0 |
| image upload + AI submit | 16 | 208 ms | 237 ms | 237 ms | 0 | 0 |
| 3D floorplan submit | 16 | 255 ms | 284 ms | 284 ms | 0 | 0 |
| showcase video submit | 16 | 308 ms | 323 ms | 323 ms | 0 | 4 |

- Queue: peak **1 active**, **11 waiting**; **12** completed, **0** failed, and **4** rejected at the configured backlog cap.
- Database pool: peak **10 connections**, **0 waiting**.
- Memory: Node peak RSS **307.3 MB**; V8 heap used **76.5 MB**; synthetic FFmpeg child peak RSS **442.3 MB**.
- Unexpected HTTP/network errors: **0**.

## Recommended launch guardrails

- Use **at least 2 vCPU and 2 GB RAM** as the starting rollout size. This is a safety baseline for the observed Node and 1080×1920 FFmpeg workload, not a claim that paid-provider latency has been benchmarked.
- Keep the existing showcase limit at **1 active render and 12 active-or-queued jobs per process**. Treat HTTP **429** from showcase submission as normal overload protection; surface retry guidance instead of retrying immediately.
- Roll out in store cohorts no larger than **12 simultaneous showcase submissions per process**. AI image and 3D submissions can scale with normal web capacity, but showcase is the bottleneck.
- Keep PostgreSQL pool contention at **0 waiting requests**. If it rises during staging tests, scale the app before raising the pool size.
- Run this harness against an isolated staging database and test-only server mode before every major chain rollout. The test server refuses to expose its fake auth, provider stubs, or metrics endpoint in production.

## Method

The test mode preserves route authentication, request parsing, uploads, quota checks, database writes, the real showcase admission queue, and one 1-second 1080×1920 local FFmpeg encode per admitted showcase job. It skips Collov, fal.ai, Rendy, email, background trackers, provider warmups, and full multi-clip assembly. These numbers prove application/queue/database burst behavior and a representative local encode; they are not a benchmark for paid-provider generation time.
