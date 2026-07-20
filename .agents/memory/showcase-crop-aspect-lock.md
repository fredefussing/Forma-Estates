---
name: Showcase crop frames are aspect-locked
description: Rendy-style crop UX decisions in the Bolig Showcase flow — pre-made frame, normalized coords, ratio-switch behavior.
---

The showcase crop tool uses a **pre-made frame locked to the video output aspect** (9:16 portrait / 16:9 landscape), rendy.io-style: user moves/resizes it, never draws it.

**Why:** Users found draw-your-own-rectangle confusing, and a free-form crop can have the wrong aspect for the output video. Matching rendy.io was an explicit user requirement.

**How to apply:**
- Crop boxes are normalized {x,y,w,h}; the aspect lock in normalized coords is h = k·w with k = natW/(outputAspect·natH) — requires the image's natural dimensions (init on img onLoad + effect for cached images).
- Switching video format (portrait ↔ landscape) **clears all saved cropBoxes** (decision: clear, don't recompute) — otherwise wrong-aspect crops get sent to Rendy and thumbnail previews stretch.
- Thumbnail cards render the exact cropped region with pure CSS (width 100/w %, height 100/h %, negative offsets) — distortion-free ONLY because box aspect == card aspect by construction.
- All Rendy progress values are rounded to integers at every boundary (server mapping, SSE client handler incl. per-video progress) — user requirement: whole numbers only.
