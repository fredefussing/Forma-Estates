---
name: Rendy post-generation text layers
description: Durable rules for headline and voice-caption edits after clean Rendy delivery.
---

Keep a clean, assembled Edit output separate from any text-burned export. Ready-state headline changes render from that clean output, while voiceover snapshots the headline settings and combines headline plus captions in one ASS/FFmpeg text pass.

**Why:** Rebuilding clips for every headline change is slow and risks unnecessary quality loss. Using an already text-burned output as the next source causes repeated encoding and can duplicate text. A retained clean lineage keeps provider masters untouched and makes retries deterministic.

**How to apply:** Use only allowlisted bundled font presets, normalized frame-relative size and position, and shared client/server bounds. Persist text settings on owner-scoped projects. Preserve the previous export until a new immutable output succeeds, and make retry/recovery resume the specific text-layer job stage.

Browser preview and ASS export must also share the headline colour and fade durations from one contract. ASS colours use BGR byte order, so warm white RGB `#F1EEE6` is encoded as `&H00E6EEF1`; apply the fade directly in ASS as well as in the browser.

**Why:** CSS-only fades disappear from the exported video, and treating ASS colour bytes as RGB produces a visibly different headline even when the hex digits look familiar.

**How to apply:** Derive preview opacity and ASS `\fad(...)` timing from the same constants. Test that opacity is zero outside the active interval and that both standalone-headline and combined voice-over ASS use the shared BGR colour and fade.

Every post-generation voice project must bind to the immutable revision of the clean Edit output it was created from. Clip or headline changes advance that revision, and stale voice projects must disappear from normal lookup and be rejected by direct GET, PATCH, export, retry, recovery, and terminal worker writes.

**Why:** Voice-over snapshots both source frames and headline settings. Without revision binding, changing clips or text can make a later “Save and finish” publish narration rendered over an older video. A separate pre-check is not enough because the Edit can change between the check and the database write.

**How to apply:** Store the source Edit revision on the voice project. Put the revision predicate inside every lease claim, externally visible read, review/ready transition, and retry restoration SQL statement; treat zero affected rows as stale. Remount client voice state when the Edit revision changes.