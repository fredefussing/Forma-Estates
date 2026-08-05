---
name: Video jobs DB registry
description: video_jobs table for restart-safe quota refunds on video generation jobs
---

## Rule
All five in-flight video job types write a row to the `video_jobs` table on job start (in addition to the in-memory Map), and mark it `completed` or `failed` when done.

## Why
The in-memory Maps (`transformVideoRefunds`, `showcaseVideoRefunds`, etc.) are wiped on server restart. A restart mid-job meant the user's quota was never refunded. The DB row is the durable source of truth.

## How to apply
- Table: `video_jobs (id, request_id UNIQUE, user_id, feature, refund_count DEFAULT 1, status, created_at)`
- Storage methods: `createVideoJob`, `completeVideoJob`, `failVideoJob`, `getStuckVideoJobs(olderThanMs)`
- On job start: call `storage.createVideoJob(...)` — uses `onConflictDoNothing` so duplicates are safe
- On complete: call `storage.completeVideoJob(requestId)` (the in-memory map's success path)
- On fail/refund: each `refundXxx` function calls `storage.failVideoJob(jobId)` after the quota refund
- Boot reset: `index.ts` calls `getStuckVideoJobs(30 * 60 * 1000)` and refunds all still-pending rows older than 30 min, then marks them failed
- `transformFilm` jobs use `refundCount = charged` (number of clips) because each clip costs 1 credit
- Table was created via direct psql DDL (drizzle-kit push needs a TTY for new tables — see drizzle-push-prompt.md)
