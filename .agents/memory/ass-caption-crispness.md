---
name: ASS caption crispness
description: Subtitle typography for mobile property video exports needs a verified editorial font and restrained visual effects.
---

For burned-in showcase captions, use the statically bundled Cormorant Garamond
SemiBold editorial serif in warm off-white, with no outline and only a subtle
soft shadow. Do not rely on a variable font file: libass falls back silently
when it cannot select it.

**Why:** The blur came from combining detailed serif strokes with a thick
contour and shadow, not from serif typography itself. A semibold static font
keeps the requested property-magazine contrast, while an outline-free render
stays clean when a portrait video is downscaled on a phone.

**How to apply:** Always pass the project font directory to FFmpeg's ASS
filter and verify its `fontselect` log before changing styles. Treat spacing,
warm-white color and short editorial phrases as the premium treatment; verify
a rendered mobile-size frame before changing caption typography.