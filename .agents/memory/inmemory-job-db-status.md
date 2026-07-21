---
name: In-memory job maps vs DB status flags
description: Video/AI jobs live in memory but write "generating" status to DB — restarts strand the flag without boot-time reset.
---

**Rule:** Whenever an async job (fal.ai video, tour, showcase) writes a `*_status = 'generating'`-style flag to the database while the job itself lives only in an in-memory map, add a boot-time reset (`UPDATE … SET status='error' WHERE status='generating'`) in `ensure-schema`, and give the frontend a poll bail-out (stop after ~5 consecutive 404s on the status endpoint).

**Why:** Render auto-deploys on every checkpoint, so mid-job restarts are routine — a stranded "generating" flag permanently hides the generate/retry buttons, and the client polls a dead jobId forever.

**How to apply:** New async generation features: (1) boot reset of stale DB status, (2) prune only non-processing jobs from the in-memory map (queued jobs can wait >1h behind MAX_CONCURRENT=1), (3) frontend clears jobId + shows retry after repeated 404s.
