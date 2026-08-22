---
name: Rendy post-generation text layers
description: Durable rules for headline and voice-caption edits after clean Rendy delivery.
---

Keep a clean, assembled Edit output separate from any text-burned export. Ready-state headline changes render from that clean output, while voiceover snapshots the headline settings and combines headline plus captions in one ASS/FFmpeg text pass.

**Why:** Rebuilding clips for every headline change is slow and risks unnecessary quality loss. Using an already text-burned output as the next source causes repeated encoding and can duplicate text. A retained clean lineage keeps provider masters untouched and makes retries deterministic.

**How to apply:** Use only allowlisted bundled font presets, normalized frame-relative size and position, and shared client/server bounds. Persist text settings on owner-scoped projects. Preserve the previous export until a new immutable output succeeds, and make retry/recovery resume the specific text-layer job stage.