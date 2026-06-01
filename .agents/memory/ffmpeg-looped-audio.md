---
name: FFmpeg looped audio bed + video
description: Why -shortest fails with an infinitely looped audio input and what to use instead
---

# Looping a music bed under a fixed-length video (FFmpeg)

When muxing an infinitely looped audio bed (`-stream_loop -1 -i music.mp3`) under a
filter_complex-built video, do **not** end the output with `-shortest`. Use an
explicit `-t <videoTotalSeconds>` instead.

**Why:** `-shortest` deadlocks/fails with an endlessly looped audio input — the
encoders finish writing their stats but finalization fails with `Conversion failed!`
(ffmpeg exit 228 in the supersampled path, or a hang/timeout, exit 124, at native
res). The infinite audio stream never signals EOF, so `-shortest` can't reliably
trim it. An explicit `-t` caps the muxer at the exact video length and exits 0.

**How to apply:** Compute `videoTotal = n*durPerImage - (n-1)*crossfade` (the
post-crossfade length), pass `-t videoTotal.toFixed(2)`, and clamp the audio
`afade=t=out:st=` to `max(0.1, videoTotal-3)` so the fade-out start is never
negative on short reels.

**Gotcha that wasted a cycle:** the dev server runs under `tsx`, which does NOT
hot-reload server-side code. After editing `server/*.ts` you MUST restart the
"Start application" workflow before re-testing, or you'll keep hitting the old
bug and think the fix didn't work.
