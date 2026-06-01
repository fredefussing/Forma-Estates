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

## Beat-synced cuts (the "edited to the music" look)

To make image switches land on the music's beat: measure each fixed track's pulse
ONCE offline (decode mp3 → mono f32 PCM via ffmpeg, run the `music-tempo` npm pkg
to get period = sec/beat and phase = first-beat time), then hardcode {period,
phase} per track. No per-render analysis cost; `music-tempo` can be uninstalled.

**Hard cuts (the current model):** join slides with `concat=n=K:v=1:a=0` (no
xfade). Hold each slide a whole number of beats (`slideDur = beats*period`) so
every slide boundary (`k*slideDur`) lands on the beat grid. Align by pre-rolling
the audio so a beat sits at video t=0: `-ss (phase mod period)`. Then cut at t=0
and every boundary is on a beat. `videoTotal = K*slideDur` (no overlap). To keep a
small upload from making a 2s reel, CYCLE the photos to a target length:
`slidePaths[k] = imagePaths[k % n]`, `K = max(n, min(MAX, round(target/slideDur)))`.

**Crossfade variant (older, if you ever bring xfade back):** the xfade eats time,
so switch-to-switch interval = `durPerImage - crossfade`; put switches `m` beats
apart with `durPerImage = m*period + crossfade`, and the perceived switch (xfade
centre) sits `crossfade/2` after the offset, so seek `-ss ((phase - crossfade/2)
mod period)`.

**Why hard cuts:** user explicitly wanted fast, instant switches on the beat (a
modern montage), not the calm melt of a crossfade. Fast track (short period) =
fast cuts automatically.

**Encode note:** with many short slides, drop the 2x supersample and render
zoompan straight at output res — far cheaper, and short clips + a gentle zoom
(≈1.04→1.12) hide the integer-pixel judder the supersample was there to fix. The
supersample is only worth it for slow, long, single-image Ken Burns moves.

**How to apply:** Bolig Showcase Video — `beatPlan()` + `buildFilter()` in
`server/showcase.ts`.

## Burned-in text captions (drawtext) inside a filter_complex

- Read caption text from a temp file with `textfile=` + `expansion=none`, never
  inline `text=`. This sidesteps all filtergraph escaping for user input and stops
  `%{...}`/`\` from being interpreted. Clean up the temp files in a `finally`.
- Wrap any `alpha=`/`enable=` *expression* value in single quotes. Inside the
  quotes the filtergraph parser leaves `,` and `:` alone, so `if(lt(t,a),..)` and
  `between(t,a,b)` survive without escaping every comma.
- drawtext does NOT auto-wrap. For variable-length user text, size the font to the
  frame: `fontsize = clamp(28..56, floor(usableWidthPx / (len*0.6)))` (DejaVu Bold
  ≈ 0.6·fontsize per glyph) or split into fixed short lines. Bundled font lives at
  `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`.

**Gotcha:** when a graph has BOTH a video overlay chain and a looped-audio branch,
build the video to a named label (e.g. `[vbase]→drawtext→[vout]`) and *append* the
audio branch with `finalFilter = \`${finalFilter};${audioChain}\``. Rebuilding from
the original `filter` string silently drops the overlay.
