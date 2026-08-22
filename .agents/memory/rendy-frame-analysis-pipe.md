---
name: Rendy frame analysis via pipe
description: Why Rendy Edit must keep scene-signature frames off temporary disk
---

**Rule:** Extract small scene-signature frames as bounded raw pixels through the shared FFmpeg queue. Do not write analysis-only JPGs to `/tmp` and reopen them in another library.

**Why:** A Rendy Edit preparation failed after FFmpeg reported completion because the temporary JPG disappeared before the image reader opened it. Render's ephemeral/process-local filesystem makes path handoffs less reliable than a single in-memory pipe.

**How to apply:** This applies to lightweight per-frame analysis only. Keep the FFmpeg concurrency limiter, enforce a strict stdout byte ceiling, and validate the exact expected frame size before using the pixels. Durable customer media still belongs in R2.