---
name: Process-wide FFmpeg admission
description: Why every local FFmpeg invocation must use one shared production concurrency guard.
---

Every server-side FFmpeg invocation must go through the single process-wide queue. Keep the production limit at one heavy process unless measured peak RSS on the live Render instance proves that more concurrency has safe headroom.

**Why:** Render killed the live service with status 137 after the previous two-slot guard was bypassed by separate scene-analysis and guided-tour FFmpeg runners. The website returned Bad Gateway during recovery. Encoding quality was not the issue; overlapping native child-process memory was.

**How to apply:** New video analysis, thumbnail, composition, export, and buffer-producing FFmpeg paths must use the shared queued helpers. Never add a module-local FFmpeg runner. Optimize waiting time through less duplicate work, not by increasing parallel FFmpeg processes.