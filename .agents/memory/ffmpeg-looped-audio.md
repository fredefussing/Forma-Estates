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

## Sample-precise looping for AAC/MP4 soundtracks

For an edited video that must keep one source soundtrack continuously, do not
loop the compressed MP4 input itself. Decode its audio once, reset timestamps,
and use FFmpeg's `aloop` with the decoded sample count; then trim that branch to
the picture track's frame-quantized duration.

**Why:** looping an AAC/MP4 input can repeat encoder priming and leave a short
audio tail mismatch even when the branch is trimmed. Picture clips also round to
whole output frames, so summing raw millisecond bounds can make audio end before
the last frame.

**How to apply:** choose one output FPS, force an explicit frame count for every
normalized clip, derive total picture duration from those same frame counts, and
trim the sample-looped audio to that duration. Probe video and audio stream
durations separately before accepting the export.

The decoded source trim and `aloop` must use the **same integer sample count**:
derive `N` from the audio stream duration, then use both `atrim=end_sample=N` and
`aloop=size=N`. Do not trim with a duration rounded to milliseconds while looping
an unrounded sample count; that creates a different loop boundary for ordinary
fractional durations. Apply the final output-duration trim and outro fade only
after this sample-exact loop branch.

For a musically seamless loop, do not chain `acrossfade` directly from branches
of one `asplit` in this FFmpeg build: repeated chaining collapsed the output to
roughly the accumulated overlap duration. Build one bounded periodic cycle
instead: overlap three sample-aligned copies with complementary fades and
delays, extract the middle period, reset its PTS, then `aloop` that period by its
exact sample count. Reset PTS again before the final outro fade, or the fade's
start time can miss the mixed stream. This keeps the graph constant-size even
for very long edits or unusually short source audio.

**Why:** Expanding one filter branch per repetition is user-media-driven and can
turn a short soundtrack plus a long edit into an oversized FFmpeg graph. A
three-copy periodic cycle has constant command size and still hides the restart.

**How to apply:** Keep picture cuts separate and hard. Quantize any small
music-fit trim upward to the picture frame clock so audio never ends one frame
before video; if the mismatch cannot be removed without over-trimming the final
clip, preserve every clip and use the seamless bounded cycle.

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

## Full-photo (no-crop) framing + gimbal moves

User did NOT want photos cropped/halved to fill 9:16. Show the WHOLE photo:
fit it (contain, `scale=W:H:force_original_aspect_ratio=decrease`) and place it,
centered, over a blurred fill of ITSELF (`scale ...:increase,crop=W:H,boxblur` +
slight `eq=brightness=-0.05`). Landscape photos get blurred bands top/bottom that
blend with the room's ceiling/floor, so it reads as full-frame, social-ready.

**Gimbal/parallax look:** move the sharp foreground and the blurred background by
DIFFERENT amounts. Cycle moves per slide (`i%4`): dolly-in, crab-right, dolly-out,
crab-left. Dolly = fg `zoompan` zoom one way + bg `zoompan` the other. Crab = inset
fg to ~90% (margin to slide in), overlay it with a time-animated `x` (uses `t`)
over a slightly counter-panning bg `zoompan`; clamp x to `[0, W-fw]` so it never
slides off.

**Critical zoompan gotcha:** `zoompan=d=N` generates N output frames PER INPUT
frame. Feed it a SINGLE still (`-i image`, NO `-loop`) → N frames. If you `-loop`
the input you get N×(loopframes) and a huge/wrong clip. For crab, the fg is 1 still
frame overlaid over the bg's N frames (`overlay=...:eof_action=repeat:repeatlast=1`).

**Per-image sizing:** to compute the fit box you need source dims — `ffprobe
-show_entries stream=width,height -of csv=s=x:p=0`, cached per unique path. Evenize
all dims/offsets (`round(v/2)*2`) for yuv420p.
