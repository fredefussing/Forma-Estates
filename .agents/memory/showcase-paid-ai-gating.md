---
name: Showcase video paid-AI slot gating
description: Why the showcase render must acquire its concurrency slot BEFORE generating paid fal.ai clips
---

# Paid-AI work must be gated by the queue slot

The Bolig Showcase reel's primary path generates one paid fal.ai (Kling 2.1)
image-to-video clip per photo. The render must `acquireSlot()` (the
MAX_CONCURRENT / MAX_BACKLOG queue) at the very TOP of `render()` — before any
upload or clip generation — not just before the FFmpeg encode.

**Why:** If the slot is acquired only right before FFmpeg, the backlog cap does
not limit how many jobs fire paid AI calls at once. Many concurrent requests can
then each open up to MAX_AI_CLIPS paid generations in parallel → runaway spend +
external-API pressure, despite MAX_BACKLOG looking like a cap.

**How to apply:** Any time paid/expensive work is added to an async job, make
sure the backpressure gate wraps that work too. Within a single job, also bound
fan-out of paid calls (showcase uses `mapLimit` at AI_CLIP_CONCURRENCY=3 instead
of `Promise.all` over all clips). And clean up any already-downloaded temp clips
if a later step throws before the FFmpeg `finally` runs.
