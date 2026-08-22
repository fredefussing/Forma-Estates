---
name: Rendy frame analysis via pipe
description: Why Rendy Edit must keep scene-signature frames off temporary disk
---

**Rule:** Extract small scene-signature frames as bounded raw pixels through the shared FFmpeg queue. Do not write analysis-only JPGs to `/tmp` and reopen them in another library. Sample against the video stream's duration, not the container duration.

**Why:** One Rendy Edit preparation failed after FFmpeg reported completion because the temporary JPG disappeared before the image reader opened it. A second real delivery had a 7.30s video stream but a 7.381s audio/container duration, so an end-frame seek returned zero bytes despite FFmpeg exiting successfully.

**How to apply:** This applies to lightweight per-frame analysis only. Keep the FFmpeg concurrency limiter, a process timeout, and a strict stdout byte ceiling. Clamp timestamps before the final video frame with an FPS-aware margin and retry slightly earlier on empty output. Durable customer media still belongs in R2.