---
name: Server-side URL fetch allowlist
description: Any server-side download of stored/user-influenced URLs must pass a host allowlist (SSRF guard)
---

**Rule:** When a server route fetches a URL that originates from user-influenced storage (e.g. `generated_images` URLs fed to `downloadToUploads`), the URL must first pass a trust check: relative `/uploads/` paths, or `https:` with hostname `fal.media`/`*.fal.media`/`*.cloudfront.net`. Everything else is rejected. Reference implementation: `isTrustedFilmImageUrl` in the routes layer (Forvandlingsfilm), applied BOTH in the candidates listing (so the UI never offers rows that would fail) and re-checked at materialization time.

**Why:** Gallery rows can contain arbitrary URLs via save flows; an unchecked server-side fetch lets a user probe internal/private network targets (SSRF). Flagged by code review 2026-07-27.

**How to apply:** Any new feature that server-side-downloads stored image/video URLs (new film/video pipelines, import features) must reuse or replicate this allowlist. Fetching URLs returned directly by the fal API in the same request lifecycle is fine (not user-influenced).

Related lesson from the same review: long-running paid jobs must settle credits **server-side** in the job's own then/catch (callback into the routes layer), never only via SSE/status polling routes — a closed tab must not leak credits. Refund helpers must delete the balance entry synchronously before awaiting DB refunds so double-triggering (job callback + status route) is idempotent.
